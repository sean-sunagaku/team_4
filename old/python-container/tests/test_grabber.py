"""Tests for pipeline/grabber.py - Video file loading with sample_movie.mp4."""

import pytest
from pathlib import Path

from src.speed_detector.pipeline.grabber import FrameGrabber, Frame


# Path to sample video
SAMPLE_VIDEO_PATH = Path(__file__).parent.parent / "sample_movie.mp4"


@pytest.fixture
def video_path():
    """Provide the path to sample_movie.mp4."""
    if not SAMPLE_VIDEO_PATH.exists():
        pytest.skip(f"Sample video not found: {SAMPLE_VIDEO_PATH}")
    return str(SAMPLE_VIDEO_PATH)


class TestFrameGrabberWithVideo:
    """Tests for FrameGrabber with real video file."""

    def test_open_video_file(self, video_path):
        """Test that video file can be opened."""
        grabber = FrameGrabber(video_url=video_path)
        result = grabber.open()

        assert result is True
        grabber.close()

    def test_get_video_info(self, video_path):
        """Test that video info (fps, resolution, frame count) can be retrieved."""
        grabber = FrameGrabber(video_url=video_path)
        grabber.open()

        info = grabber.get_video_info()

        assert "width" in info
        assert "height" in info
        assert "fps" in info
        assert "frame_count" in info
        assert "is_file" in info

        assert info["width"] > 0
        assert info["height"] > 0
        assert info["fps"] > 0
        assert info["frame_count"] > 0
        assert info["is_file"] is True

        grabber.close()

    def test_read_single_frame(self, video_path):
        """Test reading a single frame from video."""
        grabber = FrameGrabber(video_url=video_path)
        grabber.open()

        frame = grabber.read_frame()

        assert frame is not None
        assert isinstance(frame, Frame)
        assert frame.image is not None
        assert frame.width > 0
        assert frame.height > 0
        assert frame.frame_number == 1

        grabber.close()

    def test_frame_iteration(self, video_path):
        """Test iterating over multiple frames."""
        grabber = FrameGrabber(video_url=video_path)

        frames_read = 0
        max_frames = 10

        for frame in grabber.frames():
            assert frame is not None
            assert isinstance(frame, Frame)
            assert frame.image is not None
            frames_read += 1
            if frames_read >= max_frames:
                break

        assert frames_read == max_frames

    def test_context_manager(self, video_path):
        """Test using FrameGrabber as context manager."""
        with FrameGrabber(video_url=video_path) as grabber:
            frame = grabber.read_frame()

            assert frame is not None
            assert isinstance(frame, Frame)

            info = grabber.get_video_info()
            assert info["width"] > 0

    def test_frame_properties(self, video_path):
        """Test frame properties are correct."""
        with FrameGrabber(video_url=video_path) as grabber:
            info = grabber.get_video_info()
            frame = grabber.read_frame()

            # Frame dimensions should match video info
            assert frame.width == info["width"]
            assert frame.height == info["height"]

    def test_consecutive_frames_have_incrementing_numbers(self, video_path):
        """Test that frame numbers increment correctly."""
        with FrameGrabber(video_url=video_path) as grabber:
            frame1 = grabber.read_frame()
            frame2 = grabber.read_frame()
            frame3 = grabber.read_frame()

            assert frame1.frame_number == 1
            assert frame2.frame_number == 2
            assert frame3.frame_number == 3
