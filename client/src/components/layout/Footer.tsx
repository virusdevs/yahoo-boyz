import { Link } from "wouter";
import { Phone, Mail, MapPin } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-card border-t mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                YB
              </div>
              <span className="font-bold text-lg">YAHOO-BOYZ</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Grow together with daily contributions and accessible loans.
              Building financial security for all members.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Quick Links</h3>
            <nav className="flex flex-col gap-2">
              <Link
                href="/"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Home
              </Link>
              <Link
                href="/about"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                About Us
              </Link>
              <Link
                href="/contact"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Contact
              </Link>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
            </nav>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Services</h3>
            <nav className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">
                Daily Contributions
              </span>
              <span className="text-sm text-muted-foreground">
                Flexible Savings
              </span>
              <span className="text-sm text-muted-foreground">
                Loan Applications
              </span>
              <span className="text-sm text-muted-foreground">
                M-Pesa Payments
              </span>
              <span className="text-sm text-muted-foreground">
                Member Support
              </span>
            </nav>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Contact Info</h3>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>+254 748 721 079</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>nightcoller33@gmail.com</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>Gboko, Nigeria</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} YAHOO-BOYZ. All rights reserved.
          </p>
          <p className="font-bold mt-1">
            Designed by{" "}
            <a
              href="https://www.giftedtech.co.ke"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 transition-colors"
            >
              gifted tech
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
