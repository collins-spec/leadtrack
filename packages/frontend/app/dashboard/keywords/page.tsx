'use client';

import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account-context';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ArrowUpDown } from 'lucide-react';

interface KeywordData {
  keyword: string;
  match_type: string | null;
  campaign: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  calls: number;
  qualified: number;
  avg_duration: number;
  conv_rate: number;
  avg_score?: number;
  total_quoted?: number;
  total_sales?: number;
}

type SortField = 'keyword' | 'calls' | 'qualified' | 'conv_rate' | 'avg_duration' | 'avg_score' | 'total_quoted' | 'total_sales';
type SortOrder = 'asc' | 'desc';

export default function KeywordsPage() {
  const { currentAccount } = useAccount();
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [filteredKeywords, setFilteredKeywords] = useState<KeywordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);
  const [matchTypeFilter, setMatchTypeFilter] = useState('all');
  const [utmSourceFilter, setUtmSourceFilter] = useState('all');
  const [utmMediumFilter, setUtmMediumFilter] = useState('all');
  const [utmCampaignFilter, setUtmCampaignFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('calls');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    if (!currentAccount) return;
    loadKeywords();
  }, [currentAccount, range]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [keywords, matchTypeFilter, utmSourceFilter, utmMediumFilter, utmCampaignFilter, searchFilter, sortField, sortOrder]);

  const loadKeywords = async () => {
    if (!currentAccount) return;
    setLoading(true);
    try {
      const data = await api.getKeywordPerformance(currentAccount.id, range);
      setKeywords(data.keywords || []);
    } catch (error) {
      console.error('Failed to load keywords:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...keywords];

    // Apply match type filter
    if (matchTypeFilter !== 'all') {
      filtered = filtered.filter((kw) => kw.match_type === matchTypeFilter);
    }

    // Apply UTM source filter
    if (utmSourceFilter !== 'all') {
      filtered = filtered.filter((kw) => kw.utm_source === utmSourceFilter);
    }

    // Apply UTM medium filter
    if (utmMediumFilter !== 'all') {
      filtered = filtered.filter((kw) => kw.utm_medium === utmMediumFilter);
    }

    // Apply UTM campaign filter
    if (utmCampaignFilter !== 'all') {
      filtered = filtered.filter((kw) => kw.utm_campaign === utmCampaignFilter);
    }

    // Apply search filter
    if (searchFilter.trim()) {
      const search = searchFilter.toLowerCase();
      filtered = filtered.filter(
        (kw) =>
          kw.keyword.toLowerCase().includes(search) ||
          kw.campaign?.toLowerCase().includes(search) ||
          kw.utm_source?.toLowerCase().includes(search) ||
          kw.utm_medium?.toLowerCase().includes(search) ||
          kw.utm_campaign?.toLowerCase().includes(search)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortOrder === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });

    setFilteredKeywords(filtered);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="w-3 h-3" />
        {sortField === field && (
          <span className="text-[10px] text-primary">
            {sortOrder === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get unique values for dropdown filters
  const uniqueUtmSources = Array.from(new Set(keywords.map((kw) => kw.utm_source).filter(Boolean))).sort();
  const uniqueUtmMediums = Array.from(new Set(keywords.map((kw) => kw.utm_medium).filter(Boolean))).sort();
  const uniqueUtmCampaigns = Array.from(new Set(keywords.map((kw) => kw.utm_campaign).filter(Boolean))).sort();

  if (!currentAccount) {
    return <div className="text-muted-foreground">Select an account.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Keyword Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analyze which keywords drive qualified leads from Google Ads
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Date, Match Type, Search */}
          <div className="flex flex-wrap gap-3">
            {/* Date Range */}
            <Select value={String(range)} onValueChange={(v) => setRange(parseInt(v || '30'))}>
              <SelectTrigger className="w-32">
                <span className="truncate">{range === 7 ? 'Last 7 days' : range === 30 ? 'Last 30 days' : 'Last 90 days'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>

            {/* Match Type Filter */}
            <Select value={matchTypeFilter} onValueChange={(v) => setMatchTypeFilter(v || 'all')}>
              <SelectTrigger className="w-40">
                <span className="truncate">
                  {matchTypeFilter === 'all'
                    ? 'All Match Types'
                    : matchTypeFilter === 'EXACT'
                    ? 'Exact Match'
                    : matchTypeFilter === 'PHRASE'
                    ? 'Phrase Match'
                    : 'Broad Match'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Match Types</SelectItem>
                <SelectItem value="EXACT">Exact Match</SelectItem>
                <SelectItem value="PHRASE">Phrase Match</SelectItem>
                <SelectItem value="BROAD">Broad Match</SelectItem>
              </SelectContent>
            </Select>

            {/* Search */}
            <Input
              placeholder="Search keywords or campaigns..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-64"
            />

            {loading && <span className="text-sm text-muted-foreground self-center">Loading...</span>}
          </div>

          {/* Row 2: UTM Parameters */}
          <div className="flex flex-wrap gap-3">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider self-center">UTM:</div>

            {/* UTM Source Filter */}
            <Select value={utmSourceFilter} onValueChange={(v) => setUtmSourceFilter(v || 'all')}>
              <SelectTrigger className="w-40">
                <span className="truncate">
                  {utmSourceFilter === 'all' ? 'All Sources' : utmSourceFilter}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {uniqueUtmSources.map((source) => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* UTM Medium Filter */}
            <Select value={utmMediumFilter} onValueChange={(v) => setUtmMediumFilter(v || 'all')}>
              <SelectTrigger className="w-40">
                <span className="truncate">
                  {utmMediumFilter === 'all' ? 'All Mediums' : utmMediumFilter}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Mediums</SelectItem>
                {uniqueUtmMediums.map((medium) => (
                  <SelectItem key={medium} value={medium}>{medium}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* UTM Campaign Filter */}
            <Select value={utmCampaignFilter} onValueChange={(v) => setUtmCampaignFilter(v || 'all')}>
              <SelectTrigger className="w-48">
                <span className="truncate">
                  {utmCampaignFilter === 'all' ? 'All UTM Campaigns' : utmCampaignFilter}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All UTM Campaigns</SelectItem>
                {uniqueUtmCampaigns.map((campaign) => (
                  <SelectItem key={campaign} value={campaign}>{campaign}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="flex-1">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{filteredKeywords.length}</div>
              <p className="text-xs text-muted-foreground">Keywords</p>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {filteredKeywords.reduce((sum, kw) => sum + kw.calls, 0)}
              </div>
              <p className="text-xs text-muted-foreground">Total Calls</p>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {filteredKeywords.reduce((sum, kw) => sum + kw.qualified, 0)}
              </div>
              <p className="text-xs text-muted-foreground">Qualified Leads</p>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {filteredKeywords.length > 0
                  ? Math.round(
                      (filteredKeywords.reduce((sum, kw) => sum + kw.qualified, 0) /
                        filteredKeywords.reduce((sum, kw) => sum + kw.calls, 0)) *
                        100
                    )
                  : 0}
                %
              </div>
              <p className="text-xs text-muted-foreground">Avg Conv Rate</p>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                ${filteredKeywords.reduce((sum, kw) => sum + (kw.total_quoted || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <p className="text-xs text-muted-foreground">Quoted Value</p>
            </CardContent>
          </Card>
          <Card className="flex-1">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                ${filteredKeywords.reduce((sum, kw) => sum + (kw.total_sales || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <p className="text-xs text-muted-foreground">Sales Value</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <SortableHeader field="keyword" label="Keyword" />
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Match Type
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Campaign
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    UTM Source
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    UTM Medium
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    UTM Campaign
                  </th>
                  <SortableHeader field="calls" label="Calls" />
                  <SortableHeader field="qualified" label="Qualified" />
                  <SortableHeader field="conv_rate" label="Conv Rate %" />
                  <SortableHeader field="avg_score" label="Quality Score" />
                  <SortableHeader field="total_quoted" label="Quoted Value" />
                  <SortableHeader field="total_sales" label="Sales Value" />
                  <SortableHeader field="avg_duration" label="Avg Duration" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredKeywords.map((kw, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{kw.keyword}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        {kw.match_type || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {kw.campaign || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-500">
                        {kw.utm_source || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-500">
                        {kw.utm_medium || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {kw.utm_campaign || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold">{kw.calls}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-green-600">{kw.qualified}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className={`text-sm font-semibold ${
                          kw.conv_rate >= 50
                            ? 'text-green-600'
                            : kw.conv_rate >= 25
                            ? 'text-yellow-600'
                            : 'text-gray-600'
                        }`}
                      >
                        {kw.conv_rate?.toFixed(1) || '0.0'}%
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <div
                          className={`text-sm font-bold tabular-nums ${
                            kw.avg_score >= 7
                              ? 'text-green-600'
                              : kw.avg_score >= 4
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}
                        >
                          {kw.avg_score?.toFixed(1) || '0.0'}
                        </div>
                        <span className="text-xs text-gray-400">/10</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-blue-600 tabular-nums">
                        ${kw.total_quoted?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || '0'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold text-green-600 tabular-nums">
                        ${kw.total_sales?.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || '0'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-500 tabular-nums">
                        {formatDuration(kw.avg_duration)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredKeywords.length === 0 && !loading && (
              <div className="text-center py-12 text-muted-foreground">
                {keywords.length === 0
                  ? 'No keyword data available. Keywords are captured from Google Ads calls with GCLID tracking.'
                  : 'No keywords match your filters.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
