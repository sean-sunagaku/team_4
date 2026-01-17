async function getLocation(onSuccess, onError) {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    onSuccess({
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: 5000,
      city: data.city,
      region: data.region,
    });
  } catch (err) {
    onError?.({ code: -1, message: 'IP Geolocation failed: ' + err.message });
  }
}