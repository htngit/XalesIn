import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Clock, MessageSquare, Users, Volume2, Target, Image, Palette, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Key for LocalStorage
const STORAGE_KEY = 'xenderin_hide_safety_warning';

interface SafetyWarningModalProps {
  open: boolean;
  onClose: () => void;
}

export function SafetyWarningModal({ open, onClose }: SafetyWarningModalProps) {
  const [step, setStep] = useState(1);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const totalSteps = 6;
  const intl = useIntl();

  // Reset step when modal opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setDontShowAgain(false);
    }
  }, [open]);

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleDismiss = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch (e) {
        console.error('Failed to save safety warning preference', e);
      }
    }
    onClose();
  };

  // Content for each step
  const getStepContent = (currentStep: number) => {
    switch (currentStep) {
      case 1:
        return {
          icon: <Clock className="h-12 w-12 text-blue-500" />,
          title: intl.formatMessage({ id: 'safety.step.1.title', defaultMessage: "Seberapa 'Tua' Nomor Anda?" }),
          body: intl.formatMessage({ id: 'safety.step.1.body', defaultMessage: "Nomor yang baru aktif < 10 hari sangat rentan diblokir jika mengirim banyak pesan. Pastikan nomor sudah 'matang' sebelum digunakan untuk campaign." }),
          color: "bg-blue-50 text-blue-700"
        };
      case 2:
        return {
          icon: <MessageSquare className="h-12 w-12 text-green-500" />,
          title: intl.formatMessage({ id: 'safety.step.2.title', defaultMessage: "Komunikasi Dua Arah" }),
          body: intl.formatMessage({ id: 'safety.step.2.body', defaultMessage: "Hindari komunikasi satu arah. Pastikan minimal 30-40% pesan Anda DIBALAS oleh penerima. Bot spam biasanya hanya mengirim tanpa menerima balasan." }),
          color: "bg-green-50 text-green-700"
        };
      case 3:
        return {
          icon: <Users className="h-12 w-12 text-purple-500" />,
          title: intl.formatMessage({ id: 'safety.step.3.title', defaultMessage: "Sudah Ada di Kontak Mereka?" }),
          body: intl.formatMessage({ id: 'safety.step.3.body', defaultMessage: "Tameng terbaik anti-banned adalah ketika nomor Anda disimpan oleh penerima. Cek Status/Story WA Anda; jika ada 20+ viewers, artinya Anda aman." }),
          color: "bg-purple-50 text-purple-700"
        };
      case 4:
        return {
          icon: <Volume2 className="h-12 w-12 text-orange-500" />,
          title: intl.formatMessage({ id: 'safety.step.4.title', defaultMessage: "Aktif di Komunitas" }),
          body: intl.formatMessage({ id: 'safety.step.4.body', defaultMessage: "Bergabunglah di keluaran 3-5 grup WhatsApp dan berinteraksi wajar. Akun 'real' selalu memiliki jejak aktivitas komunitas." }),
          color: "bg-orange-50 text-orange-700"
        };
      case 5:
        return {
          icon: <Image className="h-12 w-12 text-indigo-500" />,
          title: intl.formatMessage({ id: 'safety.step.5.title', defaultMessage: "Lengkapi Profil Bisnis" }),
          body: intl.formatMessage({ id: 'safety.step.5.body', defaultMessage: "Jangan biarkan profil kosong. Gunakan foto profil yang jelas dan isi kolom Info/About. Profil 'hantu' adalah sasaran empuk pemblokiran otomatis." }),
          color: "bg-indigo-50 text-indigo-700"
        };
      case 6:
        return {
          icon: <Palette className="h-12 w-12 text-pink-500" />,
          title: intl.formatMessage({ id: 'safety.step.6.title', defaultMessage: "Variasikan Pesan Anda" }),
          body: intl.formatMessage({ id: 'safety.step.6.body', defaultMessage: "Jangan hanya mengirim teks monoton. Manusia mengirim gambar, stiker, dan voice note. Variasi pesan membuat pola perilaku Anda terlihat alami." }),
          color: "bg-pink-50 text-pink-700"
        };
      default:
        return {
          icon: <CheckCircle2 className="h-12 w-12 text-emerald-500" />,
          title: "Ready to Go!",
          body: "",
          color: "bg-emerald-50 text-emerald-700"
        };
    }
  };

  const content = getStepContent(step);

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleDismiss()}>
      <DialogContent className="sm:max-w-md max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ⚠️ {intl.formatMessage({ id: 'safety.modal.title', defaultMessage: 'Checklist Keamanan Akun' })}
          </DialogTitle>
        </DialogHeader>

        <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
          <div className={cn("p-4 rounded-full bg-opacity-20 flex items-center justify-center", content.color.replace('text-', 'bg-').replace('700', '100'))}>
            {content.icon}
          </div>

          <h3 className="text-xl font-bold pt-2">{content.title}</h3>
          <p className="text-gray-600 px-4 leading-relaxed">
            {content.body}
          </p>

          <div className="flex gap-1.5 mt-6 mb-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  step === i + 1 ? "w-6 bg-primary" : "w-1.5 bg-gray-200"
                )}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col sm:justify-between sm:flex-col gap-4">
          {step === totalSteps ? (
            <div className="w-full space-y-4">
              <div className="flex items-center space-x-2 justify-center py-2 bg-muted/50 rounded-lg">
                <Checkbox
                  id="dont-show"
                  checked={dontShowAgain}
                  onCheckedChange={(c) => setDontShowAgain(c === true)}
                />
                <Label
                  htmlFor="dont-show"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {intl.formatMessage({ id: 'safety.modal.dont_show', defaultMessage: 'Jangan tampilkan tips ini lagi' })}
                </Label>
              </div>
              <div className="flex w-full gap-2">
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  {intl.formatMessage({ id: 'safety.modal.button.back', defaultMessage: 'Kembali' })}
                </Button>
                <Button onClick={handleDismiss} className="flex-1" size="lg">
                  {intl.formatMessage({ id: 'safety.modal.button.done', defaultMessage: 'Okay, Saya Paham' })}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex w-full justify-between gap-2">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={step === 1}
                className={cn(step === 1 ? "opacity-0 pointer-events-none" : "opacity-100")}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {intl.formatMessage({ id: 'safety.modal.button.back', defaultMessage: 'Kembali' })}
              </Button>
              <Button onClick={handleNext}>
                {intl.formatMessage({ id: 'safety.modal.button.next', defaultMessage: 'Lanjut' })}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
          <div className="text-xs text-center text-muted-foreground mt-2 border-t pt-3 w-full">
            {intl.formatMessage({ id: 'safety.modal.footer', defaultMessage: 'Panduan ini merupakan praktik terbaik (Best Practice) untuk menjaga stabilitas akun Anda.' })}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
