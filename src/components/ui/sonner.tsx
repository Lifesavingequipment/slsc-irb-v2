import { Toaster as Sonner } from "sonner";
import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      richColors
      duration={3000}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "group toast !rounded-xl !shadow-lg !shadow-black/10 !border !border-border/60 !backdrop-blur-sm !text-sm !font-medium !py-3.5 !px-4 !min-h-[52px] !items-center",
          title: "!text-sm !font-semibold !leading-snug",
          description: "!text-xs !opacity-75 !mt-0.5",
          success:
            "!bg-white dark:!bg-card !text-foreground !border-green-200 dark:!border-green-900/40",
          error:
            "!bg-white dark:!bg-card !text-foreground !border-red-200 dark:!border-red-900/40",
          warning:
            "!bg-white dark:!bg-card !text-foreground !border-yellow-200 dark:!border-yellow-900/40",
          info:
            "!bg-white dark:!bg-card !text-foreground !border-blue-200 dark:!border-blue-900/40",
          loader:
            "!bg-white dark:!bg-card !text-foreground",
          actionButton:
            "!bg-primary !text-primary-foreground !rounded-lg !text-xs !font-semibold !h-7 !px-3",
          cancelButton:
            "!bg-muted !text-muted-foreground !rounded-lg !text-xs !font-semibold !h-7 !px-3",
          closeButton:
            "!bg-muted/60 !text-muted-foreground hover:!bg-muted !rounded-full !opacity-0 group-hover:!opacity-100 !transition-opacity",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
