import { http } from './http'

export interface DashboardSummary {
  usuarios?: number
  grupos?: number
  laboratorios?: number
  equipos?: number
}

export const dashboardApi = {
  async summary(): Promise<DashboardSummary> {
    const { data } = await http.get('/dashboard/summary')
    return data.data
  },
}
