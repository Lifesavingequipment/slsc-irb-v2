import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Smartphone, Share2, Plus, Menu, ArrowUpFromLine } from "lucide-react";

function getPlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "other";
}

export function WelcomeInfo({ clubName }: { clubName?: string }) {
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");

  useEffect(() => {
    setPlatform(getPlatform());
  }, []);

  return (
    <div className="space-y-3">
      <Card className="p-4 bg-primary/5 border-primary/10">
        <h2 className="font-semibold text-sm">
          Welcome to IRB Coaching
        </h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          IRB Coaching is the surf lifesaving team management app for clubs, coaches and members.
          {clubName
            ? ` You've been invited to join ${clubName}. Create your account below to start RSVPing to sessions, view your club's equipment, and stay connected with your team.`
            : " Create your account below to get started."}
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-accent" />
          <h3 className="font-semibold text-sm">Add to your phone</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Install IRB Coaching on your home screen for quick access — just like a regular app.
        </p>

        {platform === "ios" && (
          <div className="space-y-2 text-xs">
            <Step icon={Share2} text="Tap the Share button in Safari's toolbar (the square with an arrow)." />
            <Step icon={ArrowUpFromLine} text="Scroll down and tap 'Add to Home Screen'." />
            <Step icon={Plus} text="Tap 'Add' in the top-right corner." />
          </div>
        )}

        {platform === "android" && (
          <div className="space-y-2 text-xs">
            <Step icon={Menu} text="Tap the Chrome menu (three dots in the top-right)." />
            <Step icon={Plus} text="Tap 'Add to Home screen' or 'Install app'." />
            <Step icon={ArrowUpFromLine} text="Confirm by tapping 'Add' or 'Install'." />
          </div>
        )}

        {platform === "other" && (
          <div className="space-y-2 text-xs">
            <Step icon={Share2} text="Open this site in your phone's browser." />
            <Step icon={Menu} text="Open the browser menu and look for 'Add to Home Screen' or 'Install'." />
            <Step icon={Plus} text="Follow the prompts to add the icon to your home screen." />
          </div>
        )}
      </Card>
    </div>
  );
}

function Step({ icon: Icon, text }: { icon: typeof Share2; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 h-5 w-5 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}
