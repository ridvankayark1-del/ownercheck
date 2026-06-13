import Link from 'next/link'
import { Product } from '@/lib/types'

export function ProductCard({ product, owners = 0, questions = 0 }: { product: Product; owners?: number; questions?: number }) {
  return (
    <Link 
      href={`/product/${product.id}`} 
      className="group flex flex-col h-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-1"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-slate-50">
        <img 
          src={product.image_url || ""} 
          alt={product.name} 
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105" 
        />
        {owners > 0 && (
          <div className="absolute right-3 top-3 bg-white/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-slate-800 shadow-sm border border-white/40">
            Verified
          </div>
        )}
      </div>
      <div className="p-5 flex flex-col flex-grow justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
            {product.brand || product.category || "Catalog"}
          </p>
          <h3 className="mt-2 text-lg font-bold leading-tight tracking-tight text-slate-900 line-clamp-1">
            {product.name}
          </h3>
        </div>
        <div className="mt-4 flex gap-2 text-[11px] font-bold text-slate-500">
          <span>{owners} owners</span>
          <span>·</span>
          <span>{questions} questions</span>
        </div>
      </div>
    </Link>
  )
}
