import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestJson } from "@/lib/api";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  relationship: string;
  is_primary: boolean;
  created_at?: string;
}

export function EmergencyContacts({
  onContactsChange,
  className = "",
}: {
  onContactsChange?: (contacts: Contact[]) => void;
  className?: string;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("Family");
  const [isPrimary, setIsPrimary] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Test notification statuses map: contactId -> status string
  const [testStatuses, setTestStatuses] = useState<Record<string, { status: string; channel: string }>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const res = (await requestJson("/functions/v1/app?action=contacts")) as {
        ok?: boolean;
        contacts?: Contact[];
      };
      if (res?.ok && Array.isArray(res.contacts)) {
        setContacts(res.contacts);
        onContactsChange?.(res.contacts);
      }
    } catch {
      // Local fallback if offline
    } finally {
      setLoading(false);
    }
  }, [onContactsChange]);

  useEffect(() => {
    void fetchContacts();
  }, [fetchContacts]);

  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setRelationship("Family");
    setIsPrimary(false);
    setFormError(null);
    setEditingContact(null);
    setIsFormOpen(false);
  };

  const openAddForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (c: Contact) => {
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email || "");
    setRelationship(c.relationship || "Trusted Contact");
    setIsPrimary(c.is_primary);
    setFormError(null);
    setEditingContact(c);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim();
    const cleanPhone = phone.trim().replace(/[^\d+]/g, "");
    const cleanEmail = email.trim();

    if (!cleanName) {
      setFormError("Please enter the contact's name.");
      return;
    }
    if (!cleanPhone || cleanPhone.length < 8) {
      setFormError("Please enter a valid phone number with area/country code.");
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setFormError("That email address does not look valid.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingContact) {
        // Update contact
        await requestJson("/functions/v1/app?action=contacts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingContact.id,
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail || null,
            relationship,
            is_primary: isPrimary,
          }),
        });
      } else {
        // Add new contact
        await requestJson("/functions/v1/app?action=contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail || null,
            relationship,
            is_primary: isPrimary,
          }),
        });
      }
      resetForm();
      await fetchContacts();
    } catch {
      setFormError("Failed to save contact. Please check details and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this trusted contact?")) return;
    try {
      await requestJson(`/functions/v1/app?action=contacts&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await fetchContacts();
    } catch {
      alert("Could not remove contact. Please try again.");
    }
  };

  const handleTestAlert = async (contact: Contact) => {
    setTestingId(contact.id);
    try {
      const res = (await requestJson("/functions/v1/app?action=test_alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
        }),
      })) as {
        ok?: boolean;
        results?: Array<{ channel: string; status: string; destination: string }>;
      };

      if (res?.ok && res.results && res.results.length > 0) {
        const primaryResult = res.results[0];
        setTestStatuses((prev) => ({
          ...prev,
          [contact.id]: {
            status: primaryResult.status === "simulated" ? "Verified (Simulated)" : "Alert Delivered",
            channel: primaryResult.channel.toUpperCase(),
          },
        }));
      }
    } catch {
      setTestStatuses((prev) => ({
        ...prev,
        [contact.id]: { status: "Delivery Failed", channel: "NET" },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="poster text-2xl text-brand-ink">Trusted Circle</h3>
          <p className="micro text-brand-ink/70">
            Contacts alerted instantly with your live GPS location during an emergency
          </p>
        </div>
        <Button
          type="button"
          onClick={openAddForm}
          className="micro sh-ink-sm rounded-full bg-brand-red px-5 py-2.5 font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#c81c15]"
        >
          + Add Contact
        </Button>
      </div>

      {/* Add / Edit Form Modal Card */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="blk sh-ink relative rounded-2xl bg-brand-white p-6 text-left sm:p-7"
        >
          <div className="flex items-center justify-between border-b-2 border-brand-ink/15 pb-4">
            <h4 className="poster text-xl text-brand-red">
              {editingContact ? "Edit Emergency Contact" : "Add Emergency Contact"}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="micro text-brand-ink/60 hover:text-brand-ink"
            >
              Cancel ✕
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name" className="micro text-brand-ink">
                Full Name *
              </Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="h-12 rounded-xl border-[3px] border-brand-ink bg-brand-bone px-4 text-brand-ink"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-phone" className="micro text-brand-ink">
                Phone Number (SMS / WhatsApp) *
              </Label>
              <Input
                id="contact-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="h-12 rounded-xl border-[3px] border-brand-ink bg-brand-bone px-4 text-brand-ink"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-email" className="micro text-brand-ink">
                Email Address (Optional)
              </Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. priya@gmail.com"
                className="h-12 rounded-xl border-[3px] border-brand-ink bg-brand-bone px-4 text-brand-ink"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-rel" className="micro text-brand-ink">
                Relationship
              </Label>
              <select
                id="contact-rel"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="h-12 w-full rounded-xl border-[3px] border-brand-ink bg-brand-bone px-4 text-brand-ink"
              >
                <option value="Mother">Mother</option>
                <option value="Father">Father</option>
                <option value="Sister">Sister</option>
                <option value="Brother">Brother</option>
                <option value="Partner">Partner / Spouse</option>
                <option value="Friend">Close Friend</option>
                <option value="Roommate">Hostel Roommate</option>
                <option value="Campus Security">Campus Security</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="is-primary"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="size-4.5 rounded border-2 border-brand-ink accent-brand-red"
            />
            <Label htmlFor="is-primary" className="text-sm font-semibold text-brand-ink">
              Set as primary emergency contact (alerted first)
            </Label>
          </div>

          {formError && (
            <p role="alert" className="mt-3 text-sm font-extrabold text-brand-red">
              {formError}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="micro sh-ink-sm rounded-full bg-brand-ink px-7 py-3 font-extrabold text-brand-yellow hover:bg-black disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : editingContact ? "Save Changes" : "Add to Circle"}
            </Button>
            <Button
              type="button"
              onClick={resetForm}
              className="micro rounded-full border-[3px] border-brand-ink bg-brand-white px-6 py-3 font-extrabold text-brand-ink hover:bg-brand-bone"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Contacts List */}
      {loading ? (
        <div className="blk sh-ink rounded-2xl bg-brand-white p-8 text-center text-brand-ink/70">
          <div className="mx-auto size-7 animate-spin rounded-full border-[3px] border-brand-ink border-t-brand-red mb-3" />
          <p className="micro">Loading trusted circle...</p>
        </div>
      ) : contacts.length === 0 ? (
        <div className="blk sh-ink rounded-2xl bg-brand-white p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-brand-bone text-2xl mx-auto mb-3">
            🛡️
          </span>
          <p className="poster text-xl text-brand-ink">No Emergency Contacts Yet</p>
          <p className="mt-1 text-sm font-medium text-brand-ink/70">
            Add at least one trusted friend, family member, or campus warden so help can be dispatched automatically.
          </p>
          <Button
            type="button"
            onClick={openAddForm}
            className="micro sh-ink-sm mt-5 rounded-full bg-brand-red px-6 py-3 font-extrabold text-white hover:bg-[#c81c15]"
          >
            + Add First Contact
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="blk sh-ink rounded-2xl bg-brand-white p-5 text-left transition hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="poster text-xl text-brand-ink">{contact.name}</span>
                    {contact.is_primary && (
                      <span className="micro rounded-full bg-brand-yellow px-2.5 py-0.5 text-brand-ink font-black">
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <span className="micro inline-block text-brand-red mt-0.5">
                    {contact.relationship}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditForm(contact)}
                    aria-label={`Edit ${contact.name}`}
                    className="rounded-lg p-1.5 text-brand-ink/60 hover:bg-brand-bone hover:text-brand-ink text-sm font-extrabold"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(contact.id)}
                    aria-label={`Delete ${contact.name}`}
                    className="rounded-lg p-1.5 text-brand-ink/60 hover:bg-brand-red hover:text-white text-sm font-extrabold"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-sm font-semibold text-brand-ink/80">
                <div className="flex items-center gap-2">
                  <span>📞</span>
                  <a href={`tel:${contact.phone}`} className="hover:text-brand-red underline">
                    {contact.phone}
                  </a>
                </div>
                {contact.email && (
                  <div className="flex items-center gap-2 text-xs">
                    <span>✉️</span>
                    <span className="truncate">{contact.email}</span>
                  </div>
                )}
              </div>

              {/* Test Alert Button & Delivery Status */}
              <div className="mt-4 border-t-2 border-brand-bone pt-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={testingId === contact.id}
                  onClick={() => handleTestAlert(contact)}
                  className="micro rounded-full border-2 border-brand-ink bg-brand-bone px-3 py-1 font-extrabold text-brand-ink hover:bg-brand-yellow disabled:opacity-50"
                >
                  {testingId === contact.id ? "Sending Test..." : "Send Test Alert"}
                </button>

                {testStatuses[contact.id] && (
                  <span className="micro rounded-md bg-brand-ink px-2 py-0.5 text-brand-yellow">
                    {testStatuses[contact.id].status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
