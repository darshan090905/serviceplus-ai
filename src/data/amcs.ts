import type { AMCContract } from '../types'

export const amcContracts: AMCContract[] = []

export const amcByCustomer = new Map<string, AMCContract[]>()