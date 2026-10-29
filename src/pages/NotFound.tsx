import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="card card-pad flex flex-col items-center gap-3 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
        <Compass className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold">页面走丢了</h1>
      <p className="max-w-sm text-sm text-muted">这个地址不存在，可能是链接过期或输错了。</p>
      <Link to="/" className="btn-primary mt-2">
        回到今日
      </Link>
    </div>
  );
}
