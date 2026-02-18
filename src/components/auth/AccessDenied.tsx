import { motion } from "framer-motion";
import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

interface AccessDeniedProps {
  message?: string;
  description?: string;
}

export function AccessDenied({ 
  message = "Access Restricted", 
  description = "You don't have the required permissions to access this page. Please contact your administrator if you believe this is an error."
}: AccessDeniedProps) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-gradient-to-br from-background via-background to-secondary/20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border-2 border-destructive/20 shadow-2xl glass-morphism">
          <CardHeader className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="mx-auto"
            >
              <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
                <Shield className="h-10 w-10 text-destructive" />
              </div>
            </motion.div>
            
            <CardTitle className="text-2xl font-bold">{message}</CardTitle>
            <CardDescription className="text-base">
              {description}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <Button 
                onClick={() => navigate("/")} 
                className="w-full rounded-xl"
                size="lg"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-center text-xs text-muted-foreground"
            >
              <p>Need access? Contact your system administrator.</p>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
