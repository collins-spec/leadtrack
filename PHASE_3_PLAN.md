# Phase 3: Lead Management - Implementation Plan

## Current State Analysis

**Backend:**
- Unified leads API exists: `GET /api/leads/all` merges CallLog + FormLead
- LeadTag model exists with relations to both CallLog and FormLead
- Call playback ready: CallLog.recordingUrl stored from Twilio webhooks
- Auth + multi-tenant working

**Frontend:**
- Dashboard shows "Recent Leads" list (basic, unstyled)
- Calls page has table with playback buttons (needs audio player UI)
- No dedicated Leads page yet
- No tagging UI exists

**Gap:**
Phase 3 requires a dedicated **Leads page** with:
1. Unified lead inbox (calls + forms merged, filterable, sortable)
2. Lead tagging UI (add/remove tags, color-coded badges)
3. Lead scoring (auto-score + manual quality tags)
4. Enhanced call playback (inline audio player, not just link)

---

## Implementation Plan

### 1. Backend Enhancements

#### 1.1 Lead Scoring Service
**File:** `packages/backend/src/services/scoring.ts`

Calculate auto-score for leads:
- **Calls:** duration > 60s = 80 points, 30-60s = 50 points, 15-30s = 30 points, <15s = 10 points
- **Forms:** has phone = +20 points, has email = +10 points, has message = +10 points
- **Source:** paid (Google/Meta) = +15 points, organic = +10 points, direct = +5 points

```typescript
export function scoreCallLead(call: CallLog): number {
  let score = 0;
  if (call.duration >= 60) score += 80;
  else if (call.duration >= 30) score += 50;
  else if (call.duration >= 15) score += 30;
  else score += 10;

  if (call.trackingNumber?.source.includes('google') || call.trackingNumber?.source.includes('meta')) {
    score += 15;
  }
  return score;
}

export function scoreFormLead(form: FormLead): number {
  let score = 40; // base
  if (form.formData?.phone) score += 20;
  if (form.formData?.email) score += 10;
  if (form.formData?.message) score += 10;
  if (form.utmSource === 'google' || form.utmSource === 'facebook') score += 15;
  return score;
}
```

#### 1.2 Enhanced Leads API
**File:** `packages/backend/src/routes/leads.ts`

Modify `GET /api/leads/all`:
- Add `include: { tags: true }` to both CallLog and FormLead queries
- Add `scoreCallLead()` and `scoreFormLead()` to each result
- Add query params: `?source=google&status=COMPLETED&minScore=50&tag=Qualified`

Add new endpoints:
- `POST /api/leads/call/:id/tags` — add tag to call lead
- `POST /api/leads/form/:id/tags` — add tag to form lead
- `DELETE /api/leads/tags/:tagId` — remove any tag

**Tag creation flow:**
1. Check if tag with same name exists for this account → reuse
2. Else create new LeadTag with color assignment (cycle through preset colors)

#### 1.3 Preset Tag System
**Tags:** Qualified, Spam, Wrong Number, Booked, Missed, Follow-Up, Customer, Not Interested

Each gets a color:
- Qualified: green
- Spam: red
- Wrong Number: gray
- Booked: blue
- Missed: yellow
- Follow-Up: orange
- Customer: purple
- Not Interested: slate

Store in seed data + create during tagging if missing.

---

### 2. Frontend Implementation

#### 2.1 New Leads Page
**File:** `packages/frontend/app/dashboard/leads/page.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Leads                                    [+ Tag]    │
├─────────────────────────────────────────────────────┤
│ Filters:                                            │
│ [Source ▼] [Status ▼] [Tags ▼] [Score ▼] [Search]  │
├─────────────────────────────────────────────────────┤
│ Type │ Contact      │ Source       │ Score │ Tags  │
├─────────────────────────────────────────────────────┤
│ 📞   │ +1555999... │ Google Ads   │ 95    │ [Q]   │
│      │ 2:43        │ Brand        │       │       │
│      │ [▶ Play]    │              │       │       │
├─────────────────────────────────────────────────────┤
│ 📝   │ john@ex.com │ GMB Organic  │ 65    │ [F]   │
│      │ +1555888... │              │       │       │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Unified table with type indicator (📞 call, 📝 form)
- Inline audio player for calls (HTML5 `<audio>` with custom controls)
- Tag badges (colored pills) with click-to-add/remove
- Score display with color gradient (red < 40, yellow 40-70, green > 70)
- Filters: source dropdown, status (calls only), tag multi-select, score range slider
- Search: caller number, email, name fields
- Pagination: 25 per page

#### 2.2 Lead Detail Drawer (Optional Enhancement)
**Component:** `packages/frontend/components/lead-detail-drawer.tsx`

Click any lead row → slide-out drawer with:
- Full call/form details
- Timeline (created, answered, ended for calls; submitted for forms)
- Tag management (add/remove with autocomplete)
- Notes field (future: add Note model)
- Recording playback (calls only)

#### 2.3 Audio Player Component
**Component:** `packages/frontend/components/audio-player.tsx`

Replace "Play" link with inline player:
```tsx
<audio controls className="w-full max-w-md">
  <source src={recordingUrl} type="audio/mpeg" />
</audio>
```

Style with Tailwind to match dashboard aesthetic.

#### 2.4 Tag Management UI
**Component:** `packages/frontend/components/tag-input.tsx`

Autocomplete input for adding tags:
- Shows existing account tags as suggestions
- Creates new tag if typed name doesn't exist
- Click tag badge to remove

**Component:** `packages/frontend/components/tag-badge.tsx`

Colored pill with X button:
```tsx
<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
  Qualified
  <button onClick={onRemove}>×</button>
</span>
```

#### 2.5 Update Sidebar
Add "Leads" nav item between "Calls" and "Numbers".

---

### 3. Database Updates

#### 3.1 Seed Preset Tags
**File:** `packages/backend/prisma/seed.ts`

Add 8 preset tags for ABC Plumbing:
```typescript
const presetTags = [
  { name: 'Qualified', color: 'green' },
  { name: 'Spam', color: 'red' },
  { name: 'Wrong Number', color: 'gray' },
  { name: 'Booked', color: 'blue' },
  { name: 'Missed', color: 'yellow' },
  { name: 'Follow-Up', color: 'orange' },
  { name: 'Customer', color: 'purple' },
  { name: 'Not Interested', color: 'slate' },
];

for (const tag of presetTags) {
  await prisma.leadTag.create({
    data: {
      name: tag.name,
      color: tag.color,
      accountId: abcPlumbing.id,
    },
  });
}
```

#### 3.2 Apply Tags to Sample Leads
Assign tags to ~20% of seeded calls/forms to demonstrate the UI:
- Tag 5 calls as "Qualified" (duration > 60s)
- Tag 3 calls as "Spam" (duration < 10s)
- Tag 2 forms as "Follow-Up"

---

### 4. API Client Updates

**File:** `packages/frontend/lib/api.ts`

Add methods:
```typescript
async getLeads(accountId: string, filters?: {
  source?: string;
  status?: string;
  tags?: string[];
  minScore?: number;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.source) params.append('source', filters.source);
  // ... add all filters
  return this.get(`/leads/all?accountId=${accountId}&${params}`);
}

async addTagToCall(callId: string, tagName: string) {
  return this.post(`/leads/call/${callId}/tags`, { tagName });
}

async addTagToForm(formLeadId: string, tagName: string) {
  return this.post(`/leads/form/${formLeadId}/tags`, { tagName });
}

async removeTag(tagId: string) {
  return this.delete(`/leads/tags/${tagId}`);
}
```

---

## Implementation Order

1. **Backend scoring service** (scoring.ts)
2. **Backend tag endpoints** (leads.ts updates)
3. **Seed preset tags** (seed.ts update + re-run)
4. **Frontend tag components** (tag-badge.tsx, tag-input.tsx)
5. **Frontend audio player** (audio-player.tsx)
6. **Frontend leads page** (leads/page.tsx)
7. **API client updates** (api.ts)
8. **Update sidebar nav** (sidebar.tsx)
9. **End-to-end verification**

---

## Success Criteria

- [ ] Unified leads page shows calls + forms in single table
- [ ] Auto-score calculated and displayed for each lead
- [ ] Tags can be added/removed from leads
- [ ] Tag badges display with correct colors
- [ ] Call recordings play inline with audio player
- [ ] Filters work: source, status, tags, score, search
- [ ] Pagination handles large lead volumes
- [ ] Preset tags exist in seed data
- [ ] No TypeScript errors
- [ ] Dashboard navigation includes "Leads" item

---

## Notes

- Keep calls page as-is (call-specific view) — the new Leads page is the unified view
- Consider adding bulk tag operations later (select multiple leads → apply tag)
- Future enhancement: lead notes/comments system
- Future enhancement: lead assignment to team members
