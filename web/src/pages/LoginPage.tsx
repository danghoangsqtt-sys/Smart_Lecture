import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import type { PublicUser } from '../types';

interface LoginResponse {
  token: string;
  user: PublicUser;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setAuth(res.token, res.user);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full">
      <div className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 p-12 text-white lg:flex">
        <div className="absolute top-0 right-0 -mr-48 -mt-48 h-96 w-96 rounded-full bg-yellow-400/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-40 -mb-40 h-80 w-80 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />
        <div className="absolute top-1/2 left-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />

        <div className="relative z-10 max-w-md space-y-8 text-center">
          <div className="mb-2 inline-flex h-24 w-24 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-4xl font-black shadow-2xl backdrop-blur-sm">
            SL
          </div>
          <div>
            <h1 className="text-4xl font-black leading-tight tracking-tight">SmartLecture</h1>
            <div className="mx-auto mt-4 mb-6 h-1 w-16 rounded-full bg-yellow-400" />
            <p className="text-base font-medium leading-relaxed text-blue-100">
              Hệ thống dạy học nội bộ trong mạng LAN. Soạn câu hỏi, tổ chức thi và theo dõi lớp học ngay tại máy của bạn.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-4">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur-sm">
              <i className="fas fa-robot text-yellow-400" />
              <span>AI soạn câu hỏi</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur-sm">
              <i className="fas fa-wifi text-yellow-400" />
              <span>Chạy trong mạng LAN</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur-sm">
              <i className="fas fa-chart-line text-yellow-400" />
              <span>Theo dõi tiến độ</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 w-full text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200/40">Dữ liệu nằm trên máy của bạn</p>
        </div>
      </div>

      <div className="relative flex w-full items-center justify-center bg-white p-6 sm:p-10 lg:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 to-white lg:hidden" />

        <div className="relative z-10 w-full max-w-[420px] space-y-8">
          <div className="text-center lg:text-left">
            <div className="mb-6 flex items-center justify-center gap-3 lg:justify-start">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-lg font-black text-white shadow-lg">SL</div>
              <span className="text-xl font-black tracking-tight text-slate-800">SmartLecture</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Chào mừng trở lại!</h2>
            <p className="mt-1 text-sm text-slate-400">Đăng nhập để tiếp tục</p>
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">
              <i className="fas fa-exclamation-circle mt-0.5 text-red-400" />
              <span>{error}</span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="username" className="ml-0.5 text-sm font-semibold text-slate-600">
                Tên đăng nhập
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="ml-0.5 text-sm font-semibold text-slate-600">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-[background-color,transform,opacity] hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-arrow-right" />}
              {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
