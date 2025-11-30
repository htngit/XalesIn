# Week 3.5: Frontend Integration Guide

## Overview
Week 3.5 menghubungkan UI React dengan Backend WhatsApp yang sudah dibuat di Week 1-3. Ini adalah fase kritis untuk menyelesaikan end-to-end flow.

---

## 📋 Tasks Breakdown

### **Task 3.5.1: UI Integration for Campaign Sending**

#### Location
- `src/components/pages/SendPage.tsx` (atau buat `CampaignPage.tsx` baru)

#### Implementation Steps
1. **Add "Start Campaign" Button**
   ```tsx
   const handleStartCampaign = async () => {
     // Validation
     if (!selectedGroup || !selectedTemplate) {
       toast.error('Please select a group and template');
       return;
     }

     // Check WhatsApp connection
     const status = await window.electron.whatsapp.getStatus();
     if (!status.ready) {
       toast.error('WhatsApp is not connected. Please connect first.');
       return;
     }

     // Fetch data from Dexie
     const contacts = await db.contacts
       .where('groupId').equals(selectedGroup.id)
       .and(c => c.subscribed === true)
       .toArray();

     const template = await db.templates.get(selectedTemplate.id);

     // Start campaign
     const jobId = uuid();
     const result = await window.electron.whatsapp.processJob({
       jobId,
       contacts,
       template,
       assets: template.assets || []
     });

     if (result.success) {
       setActiveJobId(jobId);
       setShowProgress(true);
     }
   };
   ```

2. **Fetch Contacts from Selected Group**
   - Use `db.contacts.where('groupId').equals(groupId)`
   - Filter `subscribed === true`

3. **Fetch Selected Template**
   - Use `db.templates.get(templateId)`

4. **Call IPC**
   - `window.electron.whatsapp.processJob()`

---

### **Task 3.5.2: Progress Monitoring UI**

#### Create Component: `src/components/ui/JobProgressModal.tsx`

```tsx
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { Progress } from './progress';
import { Button } from './button';

interface JobProgressModalProps {
  jobId: string;
  open: boolean;
  onClose: () => void;
}

export function JobProgressModal({ jobId, open, onClose }: JobProgressModalProps) {
  const [progress, setProgress] = useState({
    processed: 0,
    total: 0,
    success: 0,
    failed: 0,
    status: 'processing'
  });

  useEffect(() => {
    const unsubscribe = window.electron.whatsapp.onJobProgress((data) => {
      if (data.jobId === jobId) {
        setProgress(data);
      }
    });

    return unsubscribe;
  }, [jobId]);

  const handlePause = async () => {
    await window.electron.whatsapp.pauseJob({ jobId });
  };

  const handleResume = async () => {
    await window.electron.whatsapp.resumeJob({ jobId });
  };

  const percentage = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Campaign Progress</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Progress value={percentage} />
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{progress.processed}</p>
              <p className="text-sm text-muted-foreground">Processed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{progress.success}</p>
              <p className="text-sm text-muted-foreground">Success</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{progress.failed}</p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </div>

          <div className="flex gap-2">
            {progress.status === 'processing' && (
              <Button onClick={handlePause}>Pause</Button>
            )}
            {progress.status === 'paused' && (
              <Button onClick={handleResume}>Resume</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

### **Task 3.5.3: Quota & History Database Updates**

#### Location
- Same component as Task 3.5.2 (in the `onJobProgress` effect)

#### Implementation
```tsx
useEffect(() => {
  const unsubscribe = window.electron.whatsapp.onJobProgress(async (data) => {
    if (data.jobId === jobId) {
      setProgress(data);

      // Update quota on completion
      if (data.status === 'completed') {
        const { quotaService, historyService } = useServices();
        const user = await authService.getCurrentUser();

        if (user) {
          // Update quota
          const currentQuota = await quotaService.getQuota(user.id);
          if (currentQuota) {
            await db.quota.update(currentQuota.id, {
              messages_used: currentQuota.messages_used + data.success
            });
          }

          // Create history entry
          await historyService.createActivityLog({
            master_user_id: user.id,
            template_name: template.name,
            total_contacts: data.total,
            successful_sends: data.success,
            failed_sends: data.failed,
            status: 'completed'
          });
        }
      }
    }
  });

  return unsubscribe;
}, [jobId]);
```

---

### **Task 3.5.4: Error Handling**

#### Check WhatsApp Connection Before Sending
```tsx
const checkConnection = async () => {
  try {
    const status = await window.electron.whatsapp.getStatus();
    return status.ready;
  } catch (error) {
    console.error('Failed to check WhatsApp status:', error);
    return false;
  }
};
```

#### Display Errors
```tsx
const handleStartCampaign = async () => {
  try {
    const isConnected = await checkConnection();
    if (!isConnected) {
      toast.error('WhatsApp is not connected. Please connect in Dashboard first.');
      return;
    }

    // ... rest of the logic
  } catch (error) {
    toast.error(`Failed to start campaign: ${error.message}`);
  }
};
```

---

## 🧪 Testing Checklist

- [ ] Click "Start Campaign" with WhatsApp disconnected → Shows error
- [ ] Click "Start Campaign" with WhatsApp connected → Progress modal appears
- [ ] Progress updates in real-time
- [ ] Pause button works
- [ ] Resume button works
- [ ] Quota updates after campaign completion
- [ ] History entry created after campaign completion
- [ ] All data syncs to Supabase

---

## 📁 Files to Create/Modify

1. **New**: `src/components/ui/JobProgressModal.tsx`
2. **Modify**: `src/components/pages/SendPage.tsx` (or create `CampaignPage.tsx`)
3. **Modify**: Related service files if quota/history logic needs adjustment

---

## 🎯 Success Criteria

✅ User can start a campaign from UI.  
✅ Real-time progress is visible.  
✅ User can pause/resume campaigns.  
✅ Quota & History are updated correctly.  
✅ All changes sync to Supabase.

---

**Ready to implement?** Start with Task 3.5.1!
