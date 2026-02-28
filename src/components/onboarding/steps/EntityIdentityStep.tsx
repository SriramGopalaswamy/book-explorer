import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ComplianceData } from "@/hooks/useOnboardingCompliance";

const ENTITY_TYPES = [
  "Proprietorship",
  "Partnership",
  "LLP",
  "Private Limited",
  "Public Limited",
  "One Person Company",
  "Trust",
  "Society",
  "HUF",
];

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa",
  "Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala",
  "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland",
  "Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura",
  "Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu & Kashmir","Ladakh",
  "Chandigarh","Puducherry","Lakshadweep","Dadra & Nagar Haveli","Andaman & Nicobar",
];

interface Props {
  data: ComplianceData;
  onChange: (updates: Partial<ComplianceData>) => void;
}

export function EntityIdentityStep({ data, onChange }: Props) {
  const showTan = ["Private Limited", "Public Limited", "LLP", "One Person Company"].includes(data.entity_type || "");
  const showCin = ["Private Limited", "Public Limited", "One Person Company", "LLP"].includes(data.entity_type || "");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Legal Name <span className="text-destructive">*</span></Label>
          <Input
            value={data.legal_name || ""}
            onChange={(e) => onChange({ legal_name: e.target.value })}
            placeholder="As per incorporation certificate"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Trade Name</Label>
          <Input
            value={data.trade_name || ""}
            onChange={(e) => onChange({ trade_name: e.target.value })}
            placeholder="Brand / trading name"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Entity Type <span className="text-destructive">*</span></Label>
          <Select value={data.entity_type || ""} onValueChange={(v) => onChange({ entity_type: v })}>
            <SelectTrigger><SelectValue placeholder="Select entity type" /></SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>PAN <span className="text-destructive">*</span></Label>
          <Input
            value={data.pan || ""}
            onChange={(e) => onChange({ pan: e.target.value.toUpperCase() })}
            placeholder="ABCDE1234F"
            maxLength={10}
          />
        </div>
      </div>

      {showTan && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>TAN</Label>
            <Input
              value={data.tan || ""}
              onChange={(e) => onChange({ tan: e.target.value.toUpperCase() })}
              placeholder="Tax Deduction Account Number"
              maxLength={10}
            />
          </div>
          {showCin && (
            <div className="space-y-1.5">
              <Label>CIN / LLPIN</Label>
              <Input
                value={data.cin_or_llpin || ""}
                onChange={(e) => onChange({ cin_or_llpin: e.target.value.toUpperCase() })}
                placeholder="Corporate identification"
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Registered Address <span className="text-destructive">*</span></Label>
        <Textarea
          value={data.registered_address || ""}
          onChange={(e) => onChange({ registered_address: e.target.value })}
          placeholder="Full registered office address"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>State <span className="text-destructive">*</span></Label>
          <Select value={data.state || ""} onValueChange={(v) => onChange({ state: v })}>
            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Pincode <span className="text-destructive">*</span></Label>
          <Input
            value={data.pincode || ""}
            onChange={(e) => onChange({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="6-digit pincode"
            maxLength={6}
          />
        </div>
      </div>
    </div>
  );
}
