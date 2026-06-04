import Link from 'next/link'
import { Product } from '@/lib/types'

export function ProductCard({ product, owners = 0, questions = 0 }: { product: Product; owners?: number; questions?: number }) {
  return (
    <Link href={`/product/${product.id}`} className="card block overflow-hidden hover:-translate-y-1 transition">
      <div className="h-44 bg-black/5">
        <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
      </div>
      <div className="p-5">
        <p className="text-sm font-semibold text-muted">{product.category}</p>
        <h3 className="mt-1 text-xl font-black">{product.name}</h3>
        <p className="mt-1 text-sm text-muted">{product.brand}</p>
        <div className="mt-4 flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-black/5 px-3 py-1">{owners} owners</span>
          <span className="rounded-full bg-black/5 px-3 py-1">{questions} questions</span>
        </div>
      </div>
    </Link>
  )
}
