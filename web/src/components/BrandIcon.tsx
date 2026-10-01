import brandIconUrl from '../../../docs/icon/Icon_sm.png';

export function BrandIcon({ className = '' }: { className?: string }) {
  return <img src={brandIconUrl} alt="Biểu trưng SmartLecture" className={className} draggable={false} />;
}
