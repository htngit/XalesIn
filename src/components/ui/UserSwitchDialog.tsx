import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FormattedMessage } from 'react-intl';

interface UserSwitchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (cleanup: boolean, remember: boolean) => void;
}

export function UserSwitchDialog({ isOpen, onClose, onConfirm }: UserSwitchDialogProps) {
  const [cleanupOption, setCleanupOption] = useState<'cleanup' | 'keep' | 'always'>('cleanup');
  const [rememberPreference, setRememberPreference] = useState(false);

  const handleConfirm = () => {
    onConfirm(cleanupOption !== 'keep', rememberPreference || cleanupOption === 'always');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage id="auth.switch_user.title" defaultMessage="User Data Cleanup" />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              id="auth.switch_user.description"
              defaultMessage="You're switching to a different user account. What would you like to do with the previous user's data?"
            />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <RadioGroup
            value={cleanupOption}
            onValueChange={(value: 'cleanup' | 'keep' | 'always') => setCleanupOption(value)}
            className="gap-4"
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="cleanup" id="cleanup" className="mt-1" />
              <Label htmlFor="cleanup" className="font-normal cursor-pointer leading-relaxed">
                <FormattedMessage id="auth.switch_user.option.cleanup" defaultMessage="Clear previous user's data" />
              </Label>
            </div>

            <div className="flex items-start space-x-3">
              <RadioGroupItem value="keep" id="keep" className="mt-1" />
              <Label htmlFor="keep" className="font-normal cursor-pointer leading-relaxed">
                <FormattedMessage id="auth.switch_user.option.keep" defaultMessage="Keep previous user's data" />
              </Label>
            </div>

            <div className="flex items-start space-x-3">
              <RadioGroupItem value="always" id="always" className="mt-1" />
              <Label htmlFor="always" className="font-normal cursor-pointer leading-relaxed">
                <FormattedMessage id="auth.switch_user.option.always" defaultMessage="Always auto-cleanup on user switch" />
              </Label>
            </div>
          </RadioGroup>

          {cleanupOption !== 'always' && (
            <div className="flex items-center space-x-2 border-t pt-4 mt-2">
              <Checkbox
                id="remember"
                checked={rememberPreference}
                onCheckedChange={(checked) => setRememberPreference(checked as boolean)}
              />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer text-muted-foreground">
                <FormattedMessage id="auth.switch_user.remember" defaultMessage="Remember my choice for future user switches" />
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <FormattedMessage id="common.button.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleConfirm}>
            <FormattedMessage id="auth.switch_user.confirm" defaultMessage="Confirm" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}