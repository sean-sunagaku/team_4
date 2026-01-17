"""Shared memory management for inter-process communication.

このモジュールはパイプラインとAPIサーバー間で状態を共有する責務を担う。

設計判断:
- Singletonパターン: グローバルに一意な状態を保証
  - 複数箇所から同じインスタンスにアクセス
  - テスト時にreset_instance()でリセット可能

- RLock（再入可能ロック）を採用:
  - 同一スレッドからの再帰的なロック取得を許可
  - デッドロック防止

- get_state()でコピーを返す:
  - 外部からの直接変更を防止
  - スレッドセーフな読み取り

=== Phase 2 拡張性 ===

現在: threading.Lock でスレッド間共有
将来: multiprocessing.shared_memory または Redis でプロセス間共有

インターフェースを変えずに内部実装を差し替え可能な設計。

┌─────────────────┐     ┌─────────────────┐
│ Pipeline Thread │────▶│  SharedMemory   │◀────│ API Server     │
│ (状態更新)       │     │  (Singleton)    │     │ (状態参照)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘

For MVP, this uses a simple thread-safe singleton pattern.
For Phase 2, this can be extended to use multiprocessing.shared_memory.
"""

import threading
from typing import Optional
from dataclasses import replace
from datetime import datetime

from .state import CurrentState, DetectionStatus


class SharedMemory:
    """Thread-safe shared memory for the current detection state.

    This class provides a simple way to share state between the video
    processing pipeline and the API server.

    For MVP (single-process), this uses a lock-protected instance.
    For Phase 2 (multi-process), this can be extended to use
    multiprocessing.shared_memory or Redis.
    """

    _instance: Optional["SharedMemory"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "SharedMemory":
        """Singleton pattern to ensure only one instance exists."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        """Initialize the shared memory."""
        if self._initialized:
            return
        self._state = CurrentState()
        self._state_lock = threading.RLock()
        self._initialized = True

    def get_state(self) -> CurrentState:
        """Get a copy of the current state.

        Returns:
            A copy of the current state (safe to read without lock).
        """
        with self._state_lock:
            # Return a shallow copy to prevent external modifications
            return replace(self._state, last_updated=self._state.last_updated)

    def update_state(self, state: CurrentState) -> None:
        """Update the current state.

        Args:
            state: The new state to set.
        """
        with self._state_lock:
            state.last_updated = datetime.now()
            self._state = state

    def get_status(self) -> DetectionStatus:
        """Get the current detection status."""
        with self._state_lock:
            return self._state.status

    def get_speed_limit(self) -> Optional[int]:
        """Get the current effective speed limit.

        Returns:
            The speed limit if confirmed and active, None otherwise.
        """
        with self._state_lock:
            return self._state.get_effective_speed_limit()

    def get_state_dict(self) -> dict:
        """Get the current state as a dictionary.

        Returns:
            Dictionary representation of the current state.
        """
        with self._state_lock:
            return self._state.to_dict()

    def reset(self) -> None:
        """Reset the state to initial values (for testing)."""
        with self._state_lock:
            self._state = CurrentState()

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (for testing)."""
        with cls._lock:
            if cls._instance is not None:
                cls._instance._initialized = False
                cls._instance._state = CurrentState()


# Convenience function to get the shared memory instance
def get_shared_memory() -> SharedMemory:
    """Get the global shared memory instance."""
    return SharedMemory()
