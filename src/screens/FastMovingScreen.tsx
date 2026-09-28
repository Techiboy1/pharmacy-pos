import { useEffect, useMemo, useState } from 'react';
import { Flame, Trophy, Calendar, Filter, TrendingUp, Package, Layers } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';

interface TopItem {
  id: string;
  name: string;
  unit: string;
  category: string;
  totalQty: number;
  totalRevenue: number;
  invoicesCount: number;
}

export function FastMovingScreen() {
  const [loading, setLoading] = useState(true);
  const [allMedicines, setAllMedicines] = useState<any[]>([]);
  const [salesItems, setSalesItems] = useState<any[]>([]);

  // Filters
  const [selectedMonths, setSelectedMonths] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    fetchEverything();
  }, [selectedMonths]);

  async function fetchEverything() {
    setLoading(true);
    try {
      // 1. Saari Inventory uthao
      const { data: medData } = await supabase
        .from('medicines')
        .select('*');
      setAllMedicines(medData || []);

      // 2. Direct sale_items uthao (bina kisi relation issue ke)
      const { data: itemData, error } = await supabase
        .from('sale_items')
        .select('*');

      if (error) {
        console.error('Error fetching sale_items:', error);
        setSalesItems([]);
      } else {
        let items = itemData || [];

        // Month Filter apply karo agar "All Time" (0) nahi hai
        if (selectedMonths > 0) {
          const cutoffDate = new Date();
          cutoffDate.setMonth(cutoffDate.getMonth() - selectedMonths);
          const cutoffTime = cutoffDate.getTime();

          items = items.filter((it: any) => {
            const dateStr = it.created_at || it.sale_date;
            if (!dateStr) return true; // Agar item par date nahi to include rakho
            return new Date(dateStr).getTime() >= cutoffTime;
          });
        }

        setSalesItems(items);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  // Category Detection
  function detectCategory(item: any): string {
    const raw = `${item.category || ''} ${item.unit || ''} ${item.name || ''}`.toLowerCase();
    if (raw.includes('tab') || raw.includes('cap') || raw.includes('strip')) {
      return 'Tablet';
    }
    if (raw.includes('syp') || raw.includes('syrup') || raw.includes('susp')) {
      return 'Syrup';
    }
    if (raw.includes('inj') || raw.includes('injection') || raw.includes('vial') || raw.includes('amp')) {
      return 'Injection';
    }
    if (raw.includes('drop') || raw.includes('cream') || raw.includes('oint') || raw.includes('gel')) {
      return 'Cream / Drops';
    }
    return 'General Items';
  }

  // Merge Inventory & Sales Items
  const rankingList = useMemo(() => {
    const map = new Map<string, TopItem>();

    // Step A: Base inventory load karo (0 sales ke sath)
    allMedicines.forEach((m) => {
      const cleanName = (m.name || 'Unknown Item').trim();
      const key = cleanName.toLowerCase();
      const cat = detectCategory(m);

      map.set(key, {
        id: m.id || key,
        name: cleanName,
        unit: m.unit || 'Units',
        category: cat,
        totalQty: 0,
        totalRevenue: 0,
        invoicesCount: 0,
      });
    });

    // Step B: Bechi gayi items ka total add karo
    salesItems.forEach((it: any) => {
      const cleanName = (it.name || 'Unknown Item').trim();
      const key = cleanName.toLowerCase();
      const qty = Number(it.qty) || 0;
      const totalAmt = Number(it.line_total || (Number(it.unit_price || 0) * qty) || 0);

      if (!map.has(key)) {
        map.set(key, {
          id: it.medicine_id || it.id || key,
          name: cleanName,
          unit: it.unit || 'Units',
          category: detectCategory(it),
          totalQty: 0,
          totalRevenue: 0,
          invoicesCount: 0,
        });
      }

      const existing = map.get(key)!;
      existing.totalQty += qty;
      existing.totalRevenue += totalAmt;
      existing.invoicesCount += 1;
    });

    let list = Array.from(map.values());

    // Step C: Category filter
    if (selectedCategory !== 'all') {
      list = list.filter((item) => item.category === selectedCategory);
    }

    // Step D: Sort Descending (Sabse zyada wali #1 par)
    list.sort((a, b) => b.totalQty - a.totalQty);

    return list;
  }, [allMedicines, salesItems, selectedCategory]);

  const topProduct = rankingList.find((i) => i.totalQty > 0);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500 fill-amber-500" />
            Product Demand & Sales Ranking
          </h1>
          <p className="text-xs text-slate-500">
            Total inventory items: Sabse zyada bikne wali se lekar zero sale tak mukammal ranking list.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Month Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
            <Calendar className="h-4 w-4 text-slate-500 ml-1" />
            <select
              value={selectedMonths}
              onChange={(e) => setSelectedMonths(Number(e.target.value))}
              className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value={1}>Last 1 Month</option>
              <option value={2}>Last 2 Months</option>
              <option value={3}>Last 3 Months</option>
              <option value={6}>Last 6 Months</option>
              <option value={0}>All Time Record</option>
            </select>
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
            <Filter className="h-4 w-4 text-slate-500 ml-1" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="Tablet">Tablets / Capsules</option>
              <option value="Syrup">Syrups / Suspensions</option>
              <option value="Injection">Injections</option>
              <option value="Cream / Drops">Creams / Drops / Ointments</option>
              <option value="General Items">General Items</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
            <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 grid place-items-center">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">#1 Top Selling Item</p>
              <p className="text-sm font-bold text-slate-800 truncate max-w-[180px]">
                {topProduct ? topProduct.name : 'No Sales Yet'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 grid place-items-center">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Highest Volume Sold</p>
              <p className="text-sm font-bold text-emerald-700">
                {topProduct ? `${topProduct.totalQty} ${topProduct.unit}` : '0 Units'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
            <div className="h-10 w-10 rounded-lg bg-indigo-50 text-indigo-600 grid place-items-center">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total Products in Category</p>
              <p className="text-sm font-bold text-indigo-700">
                {rankingList.length} Items Listed
              </p>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            Calculating rankings…
          </div>
        ) : rankingList.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-16 text-center text-slate-400 text-sm shadow-sm">
            Is category mein koi item maujood nahi hai.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                  <tr>
                    <th className="text-center px-4 py-3 w-16">Rank</th>
                    <th className="text-left px-4 py-3">Medicine Name</th>
                    <th className="text-center px-4 py-3">Form</th>
                    <th className="text-center px-4 py-3">Sold Quantity</th>
                    <th className="text-center px-4 py-3">Invoices</th>
                    <th className="text-right px-4 py-3">Total Sale Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rankingList.map((item, index) => {
                    const isSold = item.totalQty > 0;
                    const isTop1 = index === 0 && isSold;
                    const isTop2 = index === 1 && isSold;
                    const isTop3 = index === 2 && isSold;

                    return (
                      <tr
                        key={item.id + index}
                        className={`hover:bg-slate-50 transition-colors ${
                          isTop1 ? 'bg-amber-50/40 font-semibold' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          {isTop1 ? (
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-500 text-white text-xs font-bold shadow-sm">
                              🥇 1
                            </span>
                          ) : isTop2 ? (
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-300 text-slate-800 text-xs font-bold">
                              🥈 2
                            </span>
                          ) : isTop3 ? (
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-700 text-white text-xs font-bold">
                              🥉 3
                            </span>
                          ) : (
                            <span className="text-xs font-mono text-slate-400">
                              #{index + 1}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="font-semibold">{item.name}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            {item.category}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center font-bold">
                          {isSold ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {item.totalQty} {item.unit}
                            </span>
                          ) : (
                            <span className="text-xs font-normal text-slate-400">
                              0 {item.unit} (No Sale)
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center text-slate-500 font-mono text-xs">
                          {item.invoicesCount} Bills
                        </td>

                        <td className="px-4 py-3 text-right font-bold text-slate-700">
                          {formatCurrency(item.totalRevenue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}