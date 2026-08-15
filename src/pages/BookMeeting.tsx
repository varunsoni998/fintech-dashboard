
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Loader2,
  Building2,
  User,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay },
});

const timeSlots = [
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "01:00 PM",
  "01:30 PM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
  "05:00 PM",
  "05:30 PM",
];

const BookMeeting = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [meetingLink, setMeetingLink] = useState("");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const functionUrl = `${supabaseUrl}/functions/v1/book-meeting`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const qName = params.get("name") || "";
    const qEmail = params.get("email") || "";
    const qCompany = params.get("company") || "";

    setName(qName);
    setEmail(qEmail);
    setCompany(qCompany);
  }, []);

  const selectedSummary = useMemo(() => {
    if (!date || !time) return "Choose a date and time";
    return `${date} • ${time}`;
  }, [date, time]);

  const resetForm = () => {
    setDate("");
    setTime("");
  };

  const bookMeeting = async () => {
    try {
      setLoading(true);
      setSuccessMsg("");
      setErrorMsg("");
      setMeetingLink("");

      if (!name || !email || !date || !time) {
        throw new Error("Please fill all required fields.");
      }

      const res = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          name,
          email,
          company,
          date,
          time,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data?.message || "Unable to schedule meeting."
        );
      }

      setSuccessMsg(
        "Your meeting has been scheduled successfully."
      );

      setMeetingLink(data.meetLink || "");
      resetForm();
    } catch (error: any) {
      setErrorMsg(
        error?.message || "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT PANEL */}
        <motion.div
          {...fade(0)}
          className="rounded-2xl border bg-card p-8 shadow-card"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-sm mb-6">
            <Calendar className="h-4 w-4 text-accent" />
            Schedule with ModNexus
          </div>

          <h1 className="text-4xl font-serif text-foreground leading-tight">
            Book a Strategy Call
          </h1>

          <p className="text-muted-foreground mt-4 text-sm leading-6">
            Choose your preferred date and time for a
            consultation call. We’ll connect with you and
            discuss how we can help grow your business.
          </p>

          <div className="mt-8 space-y-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-accent mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  30 Minute Consultation
                </p>
                <p className="text-xs text-muted-foreground">
                  Focused strategy session tailored to your
                  needs.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-accent mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  Google Meet Included
                </p>
                <p className="text-xs text-muted-foreground">
                  Meeting link generated after booking.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-accent mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  Business Growth Consultation
                </p>
                <p className="text-xs text-muted-foreground">
                  Marketing, automation, CRM and scaling.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* RIGHT PANEL */}
        <motion.div
          {...fade(0.08)}
          className="rounded-2xl border bg-card p-8 shadow-card"
        >
          <h2 className="text-2xl font-serif">
            Select Date & Time
          </h2>

          <p className="text-sm text-muted-foreground mt-1 mb-6">
            {selectedSummary}
          </p>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Full Name *
              </label>
              <div className="relative">
                <User className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <input
                  value={name}
                  readOnly
                  placeholder="Enter your name"
                  className="w-full rounded-xl border pl-10 pr-3 py-2.5 text-sm bg-muted/40"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <input
                  value={email}
                  readOnly
                  placeholder="Enter your email"
                  className="w-full rounded-xl border pl-10 pr-3 py-2.5 text-sm bg-muted/40"
                />
              </div>
            </div>

            {/* Company */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Company Name
              </label>
              <div className="relative">
                <Building2 className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <input
                  value={company}
                  readOnly
                  placeholder="Enter company name"
                  className="w-full rounded-xl border pl-10 pr-3 py-2.5 text-sm bg-muted/40"
                />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Select Date *
              </label>
              <input
                type="date"
                min={
                  new Date()
                    .toISOString()
                    .split("T")[0]
                }
                value={date}
                onChange={(e) =>
                  setDate(e.target.value)
                }
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
              />
            </div>

            {/* Time */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Select Time *
              </label>

              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {timeSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      time === slot
                        ? "bg-accent text-accent-foreground border-accent"
                        : "hover:bg-muted"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            {/* Button */}
            <Button
              onClick={bookMeeting}
              disabled={loading}
              className="w-full mt-2 bg-gradient-gold text-accent-foreground h-11 rounded-xl"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Booking...
                </>
              ) : (
                "Confirm Booking"
              )}
            </Button>

            {/* Messages */}
            {successMsg && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                {successMsg}
              </div>
            )}

            {errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            {meetingLink && (
              <a
                href={meetingLink}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 underline break-all"
              >
                Open Google Meet Link
              </a>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default BookMeeting;