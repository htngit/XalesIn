import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AnimatedCardProps {
  animation?: 'fadeIn' | 'slideUp' | 'scale' | 'bounce';
  delay?: number;
  className?: string;
  children?: React.ReactNode;
}

const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
  ({ className, animation = 'fadeIn', delay = 0, children }, ref) => {
    const getAnimationVariants = () => {
      switch (animation) {
        case 'fadeIn':
          return {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            transition: { duration: 0.5, delay },
          };
        case 'slideUp':
          return {
            initial: { opacity: 0, y: 20 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.5, delay },
          };
        case 'scale':
          return {
            initial: { opacity: 0, scale: 0.9 },
            animate: { opacity: 1, scale: 1 },
            transition: { duration: 0.5, delay },
          };
        case 'bounce':
          return {
            initial: { opacity: 0, y: -20 },
            animate: { opacity: 1, y: 0 },
            transition: { type: 'spring' as const, stiffness: 300, damping: 20, delay },
          };
        default:
          return {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            transition: { duration: 0.5, delay },
          };
      }
    };

    return (
      <motion.div
        {...getAnimationVariants()}
      >
        <Card
          className={cn(className)}
          ref={ref}
        >
          {children}
        </Card>
      </motion.div>
    );
  }
);

AnimatedCard.displayName = 'AnimatedCard';

export { AnimatedCard };