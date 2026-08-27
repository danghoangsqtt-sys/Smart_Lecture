import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Card, PageHeader } from '../components/ui';

interface HealthInfo {
  ok: boolean;
  interfaces: { name: string; address: string }[];
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    api<HealthInfo>('/health').then(setHealth).catch(() => setHealth(null));
  }, []);

  async function showQr() {
    const ip = health?.interfaces[0]?.address;
    if (!ip) return;
    try {
      const url = await QRCode.toDataURL(`http://${ip}:4000`, { width: 320, margin: 1 });
      setQrDataUrl(url);
    } catch {
      setQrDataUrl(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={`Xin chào, ${user?.displayName ?? ''} 👋`}
        subtitle={
          user?.role === 'student'
            ? 'Học bài, làm kiểm tra và tham gia trò chơi cùng lớp của bạn'
            : 'Hệ thống dạy học nội bộ — mọi dữ liệu nằm trên máy của bạn'
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {user?.role === 'student' ? (
          <>
            <QuickLink to="/learning" icon="fa-book-open" label="Học liệu" desc="Bài giảng & tài liệu" />
            <QuickLink to="/my-exams" icon="fa-pen-to-square" label="Bài thi" desc="Kiểm tra & tự ôn" />
            <QuickLink to="/games" icon="fa-gamepad" label="Trò chơi" desc="Nhập mã phòng" />
            <QuickLink to="/settings" icon="fa-gear" label="Cài đặt" desc="Tài khoản" />
          </>
        ) : (
          <>
            <QuickLink to="/questions" icon="fa-database" label="Ngân hàng câu hỏi" desc="TN/TL + sinh bằng AI" />
            <QuickLink to="/exams" icon="fa-clipboard-check" label="Đề thi" desc="Soạn đề theo Bloom" />
            <QuickLink to="/games" icon="fa-gamepad" label="Trò chơi" desc="Trắc nghiệm nhanh, bốc thăm" />
            <QuickLink to="/classes" icon="fa-chalkboard-user" label="Lớp học" desc="Học viên, điểm danh, sổ điểm, tiến độ" />
          </>
        )}
      </div>

      {user?.role !== 'student' && health && (
        <Card className="mt-6 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
            <i className="fas fa-wifi text-blue-700" />
            Chia sẻ cho học viên trong mạng WiFi
          </h3>
          {health.interfaces.length > 0 ? (
            <>
              <ul className="space-y-1.5">
                {health.interfaces.map((i) => (
                  <li key={i.address} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">{i.name}</span>
                    <code className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-base text-blue-900">http://{i.address}:4000</code>
                  </li>
                ))}
              </ul>
              {!qrDataUrl ? (
                <button
                  onClick={() => void showQr()}
                  className="mt-3 flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <i className="fas fa-qrcode text-blue-700" />
                  Hiện mã QR cho học viên
                </button>
              ) : (
                <div className="mt-3 flex items-center gap-4">
                  <img src={qrDataUrl} alt="QR truy cập" className="w-40 rounded-sm border border-slate-200 bg-white p-2" />
                  <button onClick={() => setQrDataUrl(null)} className="text-xs font-semibold text-slate-500 hover:text-blue-700">Ẩn QR</button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Chưa phát hiện mạng LAN — học viên kết nối cùng WiFi với máy này rồi truy cập địa chỉ trên.</p>
          )}
        </Card>
      )}

      {user?.role === 'student' && (
        <Card className="mt-6 p-6 text-center">
          <p className="text-sm text-slate-500">Giáo viên đang mở trò chơi?</p>
          <Link
            to="/games"
            className="mt-3 inline-flex items-center gap-2 rounded-sm bg-blue-900 px-8 py-3 text-lg font-bold text-white shadow-lg hover:bg-blue-800"
          >
            <i className="fas fa-gamepad" />
            Nhập mã phòng
          </Link>
        </Card>
      )}
    </div>
  );
}

function QuickLink({ to, icon, label, desc }: { to: string; icon: string; label: string; desc: string }) {
  return (
    <Link to={to}>
      <Card className="group h-full p-5 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
        <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-blue-50 text-lg text-blue-900 group-hover:bg-blue-900 group-hover:text-white">
          <i className={`fas ${icon}`} />
        </div>
        <h3 className="mt-3 font-bold text-slate-800">{label}</h3>
        <p className="text-xs text-slate-500">{desc}</p>
      </Card>
    </Link>
  );
}
