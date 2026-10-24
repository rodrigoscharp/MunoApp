// A lista de corridas, no tema escuro do app do motoboy. Fica dentro do <main>
// do layout, que já limita a largura.
export default function MotoboyLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-48 bg-neutral-800 rounded animate-pulse" />
        <div className="h-3 w-56 bg-neutral-800/70 rounded animate-pulse" />
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between">
              <div className="h-3 w-16 bg-neutral-800 rounded animate-pulse" />
              <div className="h-3 w-24 bg-neutral-800 rounded animate-pulse" />
            </div>
            <div className="h-4 w-3/4 bg-neutral-800 rounded animate-pulse" />
            <div className="h-8 w-full bg-neutral-800/60 rounded-lg animate-pulse" />
            <div className="flex justify-between items-center pt-2 border-t border-neutral-800">
              <div className="h-4 w-24 bg-neutral-800 rounded animate-pulse" />
              <div className="h-9 w-24 bg-neutral-800 rounded-lg animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
