import type { Customer } from '../types'

export interface CustomerSeed {
  id: string
  name: string
  company: string
}

export const customerSeeds: CustomerSeed[] = []

export const customers: Customer[] = []

export const customerById = new Map<string, Customer>()