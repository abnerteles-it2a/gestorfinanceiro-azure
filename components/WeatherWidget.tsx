import React, { useEffect, useState } from 'react';

export const WeatherWidget: React.FC<{ isHome?: boolean }> = ({ isHome }) => {
    const [temp, setTemp] = useState<number | null>(null);
    const [city, setCity] = useState<string>('São José do Rio Preto');
    const env: any = (import.meta as any)?.env || {};
    const isDev = !!env?.DEV;

    useEffect(() => {
        const fetchWeather = async (lat: number, lon: number, name?: string) => {
            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
                const r = await fetch(url);
                const j = await r.json();
                const cw = j?.current_weather || {};
                setTemp(typeof cw.temperature === 'number' ? cw.temperature : null);
                if (name) setCity(name);
            } catch {}
        };
        const ipLocate = async () => {
            try {
                if (isDev) return false;
                const cacheRaw = window.localStorage.getItem('gestor_financeiro_ip_cache');
                if (cacheRaw) {
                    const cache = JSON.parse(cacheRaw);
                    const age = Date.now() - (cache.ts || 0);
                    if (age < 1000 * 60 * 60 * 48 && typeof cache.lat === 'number' && typeof cache.lon === 'number') {
                        const srp = { lat: -20.811, lon: -49.376, name: 'São José do Rio Preto' };
                        const d = distanceKm(cache.lat, cache.lon, srp.lat, srp.lon);
                        if (d <= 25 || /bady\s*bassitt/i.test(String(cache.city || ''))) {
                            fetchWeather(srp.lat, srp.lon, srp.name);
                            return true;
                        }
                        const refined = await reverseGeocode(cache.lat, cache.lon);
                        fetchWeather(cache.lat, cache.lon, refined || cache.city || 'Minha Localização');
                        return true;
                    }
                }
                const endpoint = isDev ? '/proxy/ipapi/json/' : 'https://ipapi.co/json/';
                const r = await fetch(endpoint);
                const j = await r.json();
                const lat = typeof j?.latitude === 'number' ? j.latitude : parseFloat(j?.latitude);
                const lon = typeof j?.longitude === 'number' ? j.longitude : parseFloat(j?.longitude);
                const c = j?.city || 'Minha Localização';
                if (!isNaN(lat) && !isNaN(lon)) {
                    try { window.localStorage.setItem('gestor_financeiro_ip_cache', JSON.stringify({ lat, lon, city: c, ts: Date.now() })); } catch {}
                    const srp = { lat: -20.811, lon: -49.376, name: 'São José do Rio Preto' };
                    const d = distanceKm(lat, lon, srp.lat, srp.lon);
                    if (d <= 25 || /bady\s*bassitt/i.test(String(c))) {
                        fetchWeather(srp.lat, srp.lon, srp.name);
                        return true;
                    }
                    const refined = await reverseGeocode(lat, lon);
                    fetchWeather(lat, lon, refined || c);
                    return true;
                }
            } catch {}
            return false;
        };
        const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
            const toRad = (v: number) => v * Math.PI / 180;
            const R = 6371;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        };
        const reverseGeocode = async (lat: number, lon: number) => {
            try {
                const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=pt-BR`;
                const r = await fetch(url, { headers: { 'User-Agent': 'gestor-financeiro-app' } });
                const j = await r.json();
                const a = j?.address || {};
                const name = a.city || a.town || a.municipality || a.village || a.county || (j?.display_name ? String(j.display_name).split(',')[0] : null);
                return name || null;
            } catch {}
            return null;
        };
        const geocode = async (name: string) => {
            try {
                const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt&format=json`;
                const r = await fetch(url);
                const j = await r.json();
                const res = Array.isArray(j?.results) ? j.results[0] : null;
                if (res && typeof res.latitude === 'number' && typeof res.longitude === 'number') {
                    return { lat: res.latitude, lon: res.longitude, name: res.name };
                }
            } catch {}
            return null;
        };
        const loadWeatherPref = () => {
            try {
                const raw = window.localStorage.getItem('gestor_financeiro_weather_pref');
                if (raw) {
                    const pref = JSON.parse(raw);
                    if (pref?.mode === 'auto') {
                        ipLocate().then((ok)=>{ if (!ok) fetchWeather(-20.811, -49.376, 'São José do Rio Preto'); });
                        return;
                    }
                    if (pref?.mode === 'fixed' && typeof pref.lat === 'number' && typeof pref.lon === 'number') {
                        fetchWeather(pref.lat, pref.lon, pref.name || 'Cidade');
                        return;
                    }
                    if (pref?.mode === 'geo') {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => {
                                const { latitude, longitude } = pos.coords;
                                fetchWeather(latitude, longitude, 'Minha Localização');
                            },
                            () => { fetchWeather(-20.811, -49.376, 'São José do Rio Preto'); },
                            { timeout: 5000 }
                        );
                        return;
                    }
                    if (pref?.mode === 'fixed' && pref?.name) {
                        geocode(pref.name).then((g) => {
                            if (g) fetchWeather(g.lat, g.lon, g.name || pref.name);
                            else fetchWeather(-20.811, -49.376, pref.name);
                        });
                        return;
                    }
                }
            } catch {}
            ipLocate().then((ok)=>{ if (!ok) fetchWeather(-20.811, -49.376, 'São José do Rio Preto'); });
        };
        loadWeatherPref();
        const handler = () => loadWeatherPref();
        window.addEventListener('gestor_financeiro_weather_pref_changed', handler as any);
        return () => window.removeEventListener('gestor_financeiro_weather_pref_changed', handler as any);
    }, []);

    return (
        <div className="flex items-center gap-2 px-3 py-1 bg-white/10 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg border border-white/20 dark:border-slate-700/50">
            <span className={`text-[11px] font-bold uppercase tracking-widest drop-shadow-md ${isHome ? 'text-slate-500 dark:text-white/90' : 'text-white/90'}`}>{city}</span>
            <span className="text-[11px] font-bold text-slate-900 bg-white/90 px-1.5 py-0.5 rounded shadow-sm">
                {temp !== null ? `${temp.toFixed(0)}°C` : '—'}
            </span>
        </div>
    );
};
