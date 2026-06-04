import { Answer, OwnedProduct, Product, Question } from './types'

export const products: Product[] = [
  {
    id: 'sony-wh-1000xm5',
    name: 'Sony WH-1000XM5',
    brand: 'Sony',
    category: 'Headphones',
    image_url: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?q=80&w=1200&auto=format&fit=crop',
    description: 'Popular wireless noise-cancelling headphones for travel, work, and everyday listening.',
    starter_questions: ['Is the mic good outside?', 'Is it comfortable after 3 hours?', 'How is the battery after months?', 'Would you buy it again?']
  },
  {
    id: 'shure-sm7b',
    name: 'Shure SM7B',
    brand: 'Shure',
    category: 'Microphones',
    image_url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=1200&auto=format&fit=crop',
    description: 'Broadcast-style dynamic microphone widely used for podcasts, vocals, and streaming.',
    starter_questions: ['Do I need a Cloudlifter?', 'Is it good in untreated rooms?', 'How close should I speak?', 'Is it worth it over cheaper mics?']
  },
  {
    id: 'focusrite-scarlett-2i2',
    name: 'Focusrite Scarlett 2i2',
    brand: 'Focusrite',
    category: 'Audio Interfaces',
    image_url: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?q=80&w=1200&auto=format&fit=crop',
    description: 'Compact USB audio interface for creators, musicians, and home studios.',
    starter_questions: ['Is it noisy?', 'Is setup easy on Windows?', 'Can it power studio headphones?', 'Is latency noticeable?']
  },
  {
    id: 'sony-zv-e10',
    name: 'Sony ZV-E10',
    brand: 'Sony',
    category: 'Cameras',
    image_url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=1200&auto=format&fit=crop',
    description: 'Creator-friendly mirrorless camera often used for YouTube, streaming, and travel content.',
    starter_questions: ['Does it overheat?', 'Is autofocus reliable?', 'Is the kit lens enough?', 'Is it good for low light?']
  },
  {
    id: 'elgato-key-light',
    name: 'Elgato Key Light',
    brand: 'Elgato',
    category: 'Lighting',
    image_url: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=1200&auto=format&fit=crop',
    description: 'Desk-mounted LED panel for streaming, video calls, and content creation.',
    starter_questions: ['Is it too bright for a small room?', 'Does the app work well?', 'Is one enough?', 'Does it get hot?']
  },
  {
    id: 'macbook-air-m3',
    name: 'MacBook Air M3',
    brand: 'Apple',
    category: 'Laptops',
    image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1200&auto=format&fit=crop',
    description: 'Thin, fanless laptop for everyday work, editing, school, and creator workflows.',
    starter_questions: ['Is 8GB RAM enough?', 'Does it heat up?', 'Can it edit video?', 'Is the base model worth it?']
  }
]

export const ownedProducts: OwnedProduct[] = [
  {
    id: 'owned-1',
    user_id: 'demo-owner-1',
    product_id: 'sony-wh-1000xm5',
    ownership_months: 8,
    verification_status: 'photo_verified',
    rating: 4.5,
    review_text: 'Great for travel and focus. The noise cancellation is excellent, but the mic is only okay in wind.',
    pros: 'Comfort, ANC, battery',
    cons: 'Mic in noisy streets',
    would_buy_again: true
  },
  {
    id: 'owned-2',
    user_id: 'demo-owner-2',
    product_id: 'shure-sm7b',
    ownership_months: 14,
    verification_status: 'trusted_owner',
    rating: 4.8,
    review_text: 'Excellent vocal mic if you have enough gain and speak close. Not plug-and-play for beginners.',
    pros: 'Warm sound, rejects room noise',
    cons: 'Needs gain, expensive setup',
    would_buy_again: true
  }
]

export const questions: Question[] = [
  { id: 'q1', product_id: 'sony-wh-1000xm5', buyer_name: 'Mert', question_text: 'Can people hear you clearly on calls when walking outside?', credit_reward: 15, status: 'open', created_at: '2026-06-02' },
  { id: 'q2', product_id: 'sony-wh-1000xm5', buyer_name: 'Elif', question_text: 'Does it hurt the top of your head after long sessions?', credit_reward: 10, status: 'answered', created_at: '2026-06-01' },
  { id: 'q3', product_id: 'shure-sm7b', buyer_name: 'Can', question_text: 'Can I use it without a Cloudlifter on a Scarlett 2i2?', credit_reward: 20, status: 'open', created_at: '2026-06-02' },
  { id: 'q4', product_id: 'macbook-air-m3', buyer_name: 'Zeynep', question_text: 'Is the base model okay for YouTube editing?', credit_reward: 20, status: 'open', created_at: '2026-06-02' }
]

export const answers: Answer[] = [
  { id: 'a1', question_id: 'q2', owner_name: 'Deniz', verification_status: 'Photo verified owner · 8 months', answer_text: 'For me it is comfortable for 2-3 hours. After that I feel slight pressure, but it is still better than most headphones I owned.', helpful_count: 12, created_at: '2026-06-01' }
]
