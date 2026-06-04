export type Product = {
  id: string
  name: string
  brand: string
  category: string
  image_url: string
  description: string
  starter_questions: string[]
}

export type OwnedProduct = {
  id: string
  user_id: string
  product_id: string
  ownership_months: number
  verification_status: 'unverified' | 'photo_verified' | 'receipt_verified' | 'trusted_owner'
  rating: number
  review_text: string
  pros: string
  cons: string
  would_buy_again: boolean
}

export type Question = {
  id: string
  product_id: string
  buyer_name: string
  question_text: string
  credit_reward: number
  status: 'open' | 'answered'
  created_at: string
}

export type Answer = {
  id: string
  question_id: string
  owner_name: string
  verification_status: string
  answer_text: string
  helpful_count: number
  created_at: string
}
