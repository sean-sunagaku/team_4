function getLocation(onSuccess, onError) {
  if (!navigator.geolocation) {
    onError?.({ code: 0, message: "Geolocation 非対応" });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      onSuccess({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    },
    (err) => {
      const messages = {
        1: "位置情報の利用が拒否されました",
        2: "位置情報を取得できません（環境要因）",
        3: "位置情報取得がタイムアウトしました",
      };
      onError?.({
        code: err.code,
        message: messages[err.code] ?? err.message,
      });
    },
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    }
  );
}