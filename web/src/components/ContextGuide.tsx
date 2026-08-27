import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Modal } from './ui';

type Guide = {
  eyebrow: string;
  title: string;
  intro: string;
  accent: string;
  steps: { icon: string; title: string; text: string }[];
  tip: string;
  action?: { label: string; to: string };
};

const guides: Record<string, Guide> = {
  classes: {
    eyebrow: 'Bản đồ lớp học',
    title: 'Điều hành một lớp, từ đầu đến cuối',
    intro: 'Lớp học là nơi tập trung học viên, tiến độ, điểm danh, điểm số và hoạt động tương tác.',
    accent: 'from-blue-950 via-blue-900 to-cyan-700',
    steps: [
      { icon: 'fa-user-plus', title: '1. Thiết lập danh sách', text: 'Vào Học viên để thêm hoặc nhập danh sách. Mỗi học viên cần thuộc lớp trước khi có thể tham gia hoạt động.' },
      { icon: 'fa-book-open', title: '2. Lên nội dung dạy', text: 'Dùng Chương trình đào tạo và Giảng dạy để sắp xếp bài, số tiết, học liệu và đánh dấu phần đã hoàn thành.' },
      { icon: 'fa-clipboard-user', title: '3. Ghi nhận buổi học', text: 'Điểm danh theo buổi/tiết; sau đó xem Sổ điểm để quản lý KTTX, quá trình và kết quả cuối kỳ.' },
      { icon: 'fa-gamepad', title: '4. Kích hoạt tương tác', text: 'Mở Trò chơi, chọn đúng lớp, tạo phòng và cho học viên quét QR hoặc nhập mã phòng. Điểm KTTX của các game hỗ trợ sẽ cập nhật về lớp.' },
    ],
    tip: 'Gợi ý tiết dạy: Điểm danh → mở học liệu → chơi 3–5 phút kiểm tra nhanh → ghi nhận kết quả.',
    action: { label: 'Mở trò chơi', to: '/games' },
  },
  games: {
    eyebrow: 'Trợ lý trò chơi',
    title: 'Tạo một hoạt động tương tác trong 60 giây',
    intro: 'Mỗi game luôn gắn với một lớp để danh sách người chơi và điểm số đi đúng ngữ cảnh.',
    accent: 'from-amber-500 via-orange-500 to-rose-600',
    steps: [
      { icon: 'fa-chess-knight', title: '1. Chọn hình thức', text: 'Dùng Trắc nghiệm nhanh để kiểm tra kiến thức; Giơ tay/Ô chữ cho thảo luận; Kéo co và Đua toán để tạo nhịp độ.' },
      { icon: 'fa-users', title: '2. Chọn lớp và nội dung', text: 'Chọn lớp đích. Với game cần câu hỏi, chọn câu hỏi từ ngân hàng; với game mạch, chuẩn bị mạch mẫu hoặc thử thách.' },
      { icon: 'fa-qrcode', title: '3. Mời học viên', text: 'Sau khi tạo phòng, chiếu QR hoặc mã 6 số. Học viên vào bằng tài khoản rồi chờ ở sảnh.' },
      { icon: 'fa-play', title: '4. Điều phối và chốt điểm', text: 'Bấm Bắt đầu khi đủ người. Giáo viên điều khiển nhịp chơi; các game có KTTX sẽ ghi điểm theo cấu hình của lớp.' },
    ],
    tip: 'Không cần chờ Internet để chơi. Chỉ AI/RAG mới có thể phụ thuộc cấu hình nhà cung cấp AI.',
  },
  teaching: {
    eyebrow: 'Workspace giảng dạy',
    title: 'Điều khiển tiết học trong một màn hình',
    intro: 'Chuẩn bị môn học trước, sau đó chuyển linh hoạt giữa nội dung bài giảng và hoạt động tương tác.',
    accent: 'from-slate-950 via-blue-900 to-teal-700',
    steps: [
      { icon: 'fa-folder-tree', title: '1. Chọn lớp và môn', text: 'Tạo môn học nếu chưa có. Mỗi môn là không gian độc lập cho cây chương trình, bài giảng và học liệu.' },
      { icon: 'fa-list-check', title: '2. Chọn mục trong cây', text: 'Trong workspace, chọn chương trình rồi chọn bài/mục. Liên kết mục đó với bài giảng để trình chiếu đúng nội dung.' },
      { icon: 'fa-photo-film', title: '3. Chuyển nội dung tức thì', text: 'Dùng thanh dưới cùng để đổi giữa trình chiếu PDF/PPTX, video và tài liệu mà không rời khỏi phiên dạy.' },
      { icon: 'fa-window-minimize', title: '4. Mở hoặc hạ Game dock', text: 'Nút Game mở bàn điều khiển trò chơi nổi. Hạ dock để quay về trình chiếu; phòng game vẫn giữ nguyên trạng thái.' },
    ],
    tip: 'Chỉ đóng dock khi đã hoàn tất game. “Hạ game xuống” là cách an toàn để chuyển về bài giảng mà không làm lại từ đầu.',
  },
  play: {
    eyebrow: 'Hướng dẫn cho học viên',
    title: 'Tham gia phòng chơi đúng cách',
    intro: 'Giữ màn hình ở trang này trong suốt hoạt động để nhận câu hỏi và kết quả trực tiếp từ giáo viên.',
    accent: 'from-violet-800 via-fuchsia-700 to-pink-600',
    steps: [
      { icon: 'fa-keyboard', title: '1. Nhập mã phòng', text: 'Nhập mã 6 số giáo viên cung cấp hoặc quét QR. Tên của bạn sẽ xuất hiện trong sảnh chờ.' },
      { icon: 'fa-hourglass-half', title: '2. Chờ hiệu lệnh', text: 'Chỉ giáo viên mới bắt đầu vòng chơi. Khi câu hỏi mở ra, đồng hồ là thời gian còn lại trên máy chủ.' },
      { icon: 'fa-hand', title: '3. Trả lời theo thể thức', text: 'Chọn đáp án một lần ở game quiz; với Giơ tay hãy bấm giơ tay rồi chờ được chọn; game mạch cần nộp thiết kế.' },
      { icon: 'fa-trophy', title: '4. Theo dõi kết quả', text: 'Điểm và bảng xếp hạng cập nhật ngay. Nếu giáo viên cấu hình KTTX, kết quả hợp lệ sẽ được ghi nhận vào lớp.' },
    ],
    tip: 'Mất kết nối? Hãy vào lại bằng cùng tài khoản và mã phòng khi hoạt động vẫn còn mở.',
  },
};

function selectGuide(pathname: string): Guide {
  if (pathname === '/teaching' || pathname.includes('/teach/')) return guides.teaching;
  if (pathname === '/games') return guides.games;
  if (pathname === '/games/play') return guides.play;
  if (pathname.startsWith('/classes')) return guides.classes;
  return guides.classes;
}

export function ContextGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const guide = selectGuide(location.pathname);

  return (
    <Modal open={open} onClose={onClose} title="Hướng dẫn nhanh" wide>
      <div className="overflow-hidden rounded-sm border border-slate-200 bg-slate-50">
        <div className={`relative overflow-hidden bg-gradient-to-br ${guide.accent} px-6 py-7 text-white`}>
          <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full border-[18px] border-white/15" />
          <div className="absolute right-14 bottom-[-28px] h-24 w-24 rotate-12 rounded-2xl bg-white/10" />
          <p className="relative text-[10px] font-black uppercase tracking-[0.25em] text-white/70">{guide.eyebrow}</p>
          <h4 className="relative mt-2 max-w-xl text-2xl font-black leading-tight">{guide.title}</h4>
          <p className="relative mt-2 max-w-xl text-sm leading-6 text-white/85">{guide.intro}</p>
        </div>
        <div className="grid gap-px bg-slate-200 md:grid-cols-2">
          {guide.steps.map((step) => (
            <div key={step.title} className="bg-white p-4">
              <div className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-900 ring-1 ring-blue-100"><i className={`fas ${step.icon}`} /></span>
                <div><h5 className="text-sm font-black text-slate-800">{step.title}</h5><p className="mt-1 text-xs leading-5 text-slate-500">{step.text}</p></div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="max-w-xl"><i className="fas fa-lightbulb mr-2 text-amber-600" />{guide.tip}</p>
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Đã hiểu</Button>{guide.action && <Button onClick={() => { onClose(); navigate(guide.action!.to); }}>{guide.action.label} <i className="fas fa-arrow-right" /></Button>}</div>
        </div>
      </div>
    </Modal>
  );
}
