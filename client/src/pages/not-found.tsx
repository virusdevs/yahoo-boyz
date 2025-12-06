import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home, ArrowLeft, Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <Card className="w-full max-w-lg mx-4 border-gray-200 dark:border-gray-800 dark:bg-gray-950">
        <CardContent className="pt-8 pb-6 px-6">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-red-100 dark:bg-red-900/30 rounded-full blur-xl"></div>
              <AlertCircle className="relative h-24 w-24 text-red-500 dark:text-red-400" />
            </div>

            <div className="mb-4">
              <span className="inline-block px-3 py-1 text-sm font-semibold text-red-800 dark:text-red-300 bg-red-100 dark:bg-red-900/40 rounded-full">
                404 Error
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              Page Not Found
            </h1>

            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-md">
              Oops! The page you&apos;re looking for seems to have wandered off
              into the digital void.
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="flex items-start gap-3">
                <Search className="h-5 w-5 text-gray-500 dark:text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                    Possible reasons:
                  </h3>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                      The page might have been moved or deleted
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                      You might have mistyped the URL
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                      The page hasn&apos;t been added to the router yet
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button asChild variant="default" className="flex-1 gap-2">
                <Link href="/">
                  <Home className="h-4 w-4" />
                  Go to Homepage
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="flex-1 gap-2 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Link href="#" onClick={() => window.history.back()}>
                  <ArrowLeft className="h-4 w-4" />
                  Go Back
                </Link>
              </Button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-500 text-center pt-4">
              Need help?{" "}
              <Link
                href="/contact"
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline underline-offset-2"
              >
                Contact Support
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
