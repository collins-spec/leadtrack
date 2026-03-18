'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface TagInputProps {
  onAddTag: (tagName: string, tagColor: string) => void;
  existingTags?: string[];
}

const PRESET_TAGS = [
  { name: 'Qualified', color: '#10b981' },
  { name: 'Spam', color: '#ef4444' },
  { name: 'Wrong Number', color: '#6b7280' },
  { name: 'Booked', color: '#3b82f6' },
  { name: 'Missed', color: '#f59e0b' },
  { name: 'Follow-Up', color: '#f97316' },
  { name: 'Customer', color: '#8b5cf6' },
  { name: 'Not Interested', color: '#64748b' },
];

export function TagInput({ onAddTag, existingTags = [] }: TagInputProps) {
  const [open, setOpen] = useState(false);

  const handleAddTag = (tagName: string, tagColor: string) => {
    onAddTag(tagName, tagColor);
    setOpen(false);
  };

  const availableTags = PRESET_TAGS.filter(tag => !existingTags.includes(tag.name));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="w-4 h-4" />
          Add Tag
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {availableTags.length > 0 ? (
            availableTags.map((tag) => (
              <Button
                key={tag.name}
                variant="outline"
                onClick={() => handleAddTag(tag.name, tag.color)}
                className="justify-start"
              >
                <span
                  className="w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </Button>
            ))
          ) : (
            <p className="col-span-2 text-sm text-gray-500 text-center py-4">
              All preset tags have been added.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
