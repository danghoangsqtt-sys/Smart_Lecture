import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

  useEffect(() => {
    api<HealthInfo>('/health').then(setHealth).catch(() => setHealth(null));
  }, []);

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
            <QuickLink to="/learning" icon="📚" label="Học liệu" desc="Bài giảng & tài liệu" />
            <QuickLink to="/my-exams" icon="📝" label="Bài thi" desc="Kiểm tra & tự ôn" />
            <QuickLink to="/games" icon="🎮" label="Trò chơi" desc="Nhập mã phòng" />
            <QuickLink to="/settings" icon="⚙️" label="Cài đặt" desc="Tài khoản" />
          </>
        ) : (
          <>
            <QuickLink to="/questions" icon="❓" label="Ngân hàng câu hỏi" desc="TN/TL + sinh bằng AI" />
            <QuickLink to="/exams" icon="📝" label="Đề thi" desc="Soạn đề theo Bloom" />
            <QuickLink to="/games" icon="🎮" label="Trò chơi" desc="Trắc nghiệm nhanh, bốc thăm" />
            <QuickLink to="/gradebook" icon="📊" label="Sổ điểm" desc="3 cột điểm + chuyên cần" />
          </>
        )}
      </div>

      {user?.role !== 'student' && health && (
        <Card className="mt-6 p-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-300">🔗 Chia sẻ cho học viên trong mạng WiFi</h3>
          {health.interfaces.length > 0 ? (
            <ul className="space-y-1.5">
              {health.interfaces.map((i) => (
                <li key={i.address} className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">{i.name}</span>
                  <code className="rounded-lg bg-slate-800 px-3 py-1.5 font-mono text-base text-indigo-300">http://{i.address}:4000</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Chưa phát hiện mạng LAN — học viên kết nối cùng WiFi với máy này rồi truy cập địa chỉ trên.</p>
          )}
        </Card>
      )}

      {user?.role === 'student' && (
        <Card className="mt-6 p-6 text-center">
          <p className="text-sm text-slate-400">Giáo viên đang mở trò chơi?</p>
          <Link to="/games" className="mt-2 inline-block rounded-xl bg-indigo-600 px-8 py-3 text-lg font-bold text-white hover:bg-indigo-500">
            🎮 Nhập mã phòng
          </Link>
        </Card>
      )}
    </div>
  );
}

function QuickLink({ to, icon, label, desc }: { to: string; icon: string; label: string; desc: string }) {
  return (
    <Link to={to}>
      <Card className="group h-full p-5 transition hover:ring-indigo-600/60">
        <span className="text-3xl">{icon}</span>
        <h3 className="mt-2 font-semibold group-hover:text-indigo-300">{label}</h3>
        <p className="text-xs text-slate-400">{desc}</p>
      </Card>
    </Link>
  );
}
