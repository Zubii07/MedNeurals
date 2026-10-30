import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import DashboardPage from '@/pages/DashboardPage'
import InventoryPage from '@/pages/InventoryPage'
import StockoutRisksPage from '@/pages/StockoutRisksPage'
import RecommendationsPage from '@/pages/RecommendationsPage'
import ForecastsPage from '@/pages/ForecastsPage'
import ProductsPage from '@/pages/ProductsPage'
import ProductAnalysisPage from '@/pages/ProductAnalysisPage'
import SuppliersPage from '@/pages/SuppliersPage'
import SupplierPerformancePage from '@/pages/SupplierPerformancePage'
import PurchaseOrdersPage from '@/pages/PurchaseOrdersPage'
import DataPredictionsPage from '@/pages/DataPredictionsPage'
import NotFoundPage from '@/pages/NotFoundPage'

// Routes from plan section 4. Product Analysis and Products are reached from search, tables and buttons.
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'stockout-risks', element: <StockoutRisksPage /> },
      { path: 'recommendations', element: <RecommendationsPage /> },
      { path: 'forecasts', element: <ForecastsPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'products/:itemId', element: <ProductAnalysisPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'suppliers/:supplierId', element: <SupplierPerformancePage /> },
      { path: 'purchase-orders', element: <PurchaseOrdersPage /> },
      { path: 'data', element: <DataPredictionsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default router
