import { Clock, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function PendingApproval() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "hsl(270 10% 6%)" }}
    >
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Clock className="h-8 w-8 text-blue-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">
            Account Pending Approval
          </h1>
          <p className="text-white/60 leading-relaxed">
            Your Microsoft 365 account has been verified, but your system access
            is awaiting approval from an administrator.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-left space-y-2">
          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <p className="text-sm text-white/70">
              Your administrator will be notified and will assign you the
              appropriate role. You can sign in again once your account has been
              approved.
            </p>
          </div>
        </div>

        <Button asChild variant="outline" className="border-white/20 text-white/70 hover:text-white">
          <Link to="/auth">Back to Sign In</Link>
        </Button>
      </div>
    </div>
  );
}
