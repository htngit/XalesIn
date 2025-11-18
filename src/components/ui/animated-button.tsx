import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { type VariantProps } from 'class-variance-authority';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

interface AnimatedButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  animation?: 'scale' | 'bounce' | 'pulse' | 'slide';
  children?: React.ReactNode;
}

const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ className, variant = 'default', size = 'default', animation = 'scale', children, ...props }, ref) => {
    const getAnimationVariants = () => {
      switch (animation) {
        case 'scale':
          return {
            whileHover: { scale: 1.05 },
            whileTap: { scale: 0.95 },
          };
        case 'bounce':
          return {
            whileHover: { y: -2 },
            whileTap: { y: 0 },
          };
        case 'pulse':
          return {
            whileHover: { scale: 1.05 },
            whileTap: { scale: 0.95 },
          };
        case 'slide':
          return {
            whileHover: { x: 4 },
            whileTap: { x: 0 },
          };
        default:
          return {
            whileHover: { scale: 1.05 },
            whileTap: { scale: 0.95 },
          };
      }
    };

    return (
      <motion.div
        {...getAnimationVariants()}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      >
        <Button
          className={cn(className)}
          variant={variant}
          size={size}
          ref={ref}
          {...props}
        >
          {children}
        </Button>
      </motion.div>
    );
  }
);

AnimatedButton.displayName = 'AnimatedButton';

export { AnimatedButton };