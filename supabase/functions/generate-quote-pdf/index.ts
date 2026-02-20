import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuoteItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  hsn_sac?: string;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
}

interface Quote {
  id: string;
  quote_number: string;
  client_name: string;
  client_email: string;
  amount: number;
  due_date: string;
  status: string;
  created_at: string;
  place_of_supply?: string;
  payment_terms?: string;
  subtotal?: number;
  cgst_total?: number;
  sgst_total?: number;
  igst_total?: number;
  total_amount?: number;
  notes?: string;
  customer_gstin?: string;
  quote_items: QuoteItem[];
}

interface InvoiceSettings {
  company_name?: string;
  cin?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  signature_url?: string;
  msme_number?: string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  account_type?: string;
  branch?: string;
  ifsc_code?: string;
  upi_code?: string;
  custom_footer_text?: string;
}

const BRAND_COLORS = {
  primary: rgb(0.85, 0.15, 0.55),
  dark: rgb(0.13, 0.12, 0.15),
  text: rgb(0.15, 0.15, 0.18),
  muted: rgb(0.45, 0.47, 0.5),
  light: rgb(0.97, 0.97, 0.98),
  white: rgb(1, 1, 1),
  headerBg: rgb(0.96, 0.96, 0.97),
  tableBorder: rgb(0.85, 0.85, 0.87),
};

const formatCurrency = (amount: number): string => {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

function drawText(page: any, text: string, x: number, y: number, font: any, size: number, color: any) {
  page.drawText(text, { x, y, size, font, color });
}

function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero';

  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  };

  return 'Indian Rupee ' + convert(Math.floor(num)) + ' Only';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { quoteId } = await req.json();
    if (!quoteId) throw new Error("Quote ID is required");

    const { data: quote, error: quoteError } = await supabaseClient
      .from("quotes")
      .select(`*, quote_items(*)`)
      .eq("id", quoteId)
      .eq("user_id", user.id)
      .single();

    if (quoteError || !quote) throw new Error("Quote not found");

    const { data: settings } = await supabaseClient
      .from("invoice_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const s: InvoiceSettings = settings || {};

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let y = height - 40;
    const leftMargin = 40;
    const rightEdge = width - 40;

    // Logo
    let logoImage: any = null;
    if (s.logo_url) {
      try {
        const logoResponse = await fetch(s.logo_url);
        const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
        const contentType = logoResponse.headers.get("content-type") || "";
        logoImage = contentType.includes("png")
          ? await pdfDoc.embedPng(logoBytes)
          : await pdfDoc.embedJpg(logoBytes);
      } catch (e) {
        console.log("Could not embed logo:", e);
      }
    }

    // Company header
    if (logoImage) {
      const logoScale = 40 / logoImage.height;
      page.drawImage(logoImage, { x: leftMargin, y: y - 35, width: logoImage.width * logoScale, height: 40 });
      y -= 5;
    }

    const companyName = s.company_name || "GRX10 SOLUTIONS PRIVATE LIMITED";
    drawText(page, companyName, leftMargin + (logoImage ? 50 : 0), y, bold, 12, BRAND_COLORS.text);
    y -= 14;

    if (s.cin) { drawText(page, `CIN: ${s.cin}`, leftMargin, y, regular, 8, BRAND_COLORS.muted); y -= 11; }

    const addressParts: string[] = [];
    if (s.address_line1) addressParts.push(s.address_line1);
    if (s.address_line2) addressParts.push(s.address_line2);
    if (s.city) addressParts.push(s.city);
    if (s.state) addressParts.push(s.state);
    if (s.pincode) addressParts.push(s.pincode);
    if (s.country) addressParts.push(s.country);

    if (addressParts.length > 0) {
      const addr = addressParts.join(", ");
      if (addr.length > 70) {
        drawText(page, addr.substring(0, 70), leftMargin, y, regular, 8, BRAND_COLORS.muted); y -= 11;
        drawText(page, addr.substring(70), leftMargin, y, regular, 8, BRAND_COLORS.muted); y -= 11;
      } else {
        drawText(page, addr, leftMargin, y, regular, 8, BRAND_COLORS.muted); y -= 11;
      }
    }

    if (s.gstin) { drawText(page, `GSTIN ${s.gstin}`, leftMargin, y, regular, 8, BRAND_COLORS.muted); y -= 11; }
    if (s.phone) { drawText(page, s.phone, leftMargin, y, regular, 8, BRAND_COLORS.muted); y -= 11; }
    if (s.email) { drawText(page, s.email, leftMargin, y, regular, 8, BRAND_COLORS.muted); y -= 11; }
    if (s.website) { drawText(page, s.website, leftMargin, y, regular, 8, BRAND_COLORS.muted); y -= 11; }

    // Quote details on right
    const rightCol = 400;
    let ry = height - 40;
    drawText(page, `Quote #: ${quote.quote_number}`, rightCol, ry, regular, 9, BRAND_COLORS.text); ry -= 13;
    if (quote.place_of_supply) {
      drawText(page, `Place Of Supply: ${quote.place_of_supply}`, rightCol, ry, regular, 9, BRAND_COLORS.text); ry -= 13;
    }
    drawText(page, `Quote Date: ${formatDate(quote.created_at)}`, rightCol, ry, regular, 9, BRAND_COLORS.text); ry -= 13;
    drawText(page, `Terms: ${quote.payment_terms || 'Due on Receipt'}`, rightCol, ry, regular, 9, BRAND_COLORS.text); ry -= 13;
    drawText(page, `Valid Until: ${formatDate(quote.due_date)}`, rightCol, ry, regular, 9, BRAND_COLORS.text);

    y -= 10;

    // QUOTATION title
    page.drawRectangle({ x: leftMargin, y: y - 5, width: rightEdge - leftMargin, height: 22, color: BRAND_COLORS.primary });
    drawText(page, "QUOTATION", leftMargin + 10, y, bold, 12, BRAND_COLORS.white);
    y -= 30;

    // Bill To
    drawText(page, "To", leftMargin, y, bold, 10, BRAND_COLORS.text); y -= 14;
    drawText(page, quote.client_name, leftMargin, y, bold, 10, BRAND_COLORS.text); y -= 12;
    if (quote.client_email) { drawText(page, quote.client_email, leftMargin, y, regular, 9, BRAND_COLORS.muted); y -= 12; }
    if (quote.customer_gstin) { drawText(page, `GSTIN: ${quote.customer_gstin}`, leftMargin, y, regular, 9, BRAND_COLORS.muted); y -= 12; }

    if (s.msme_number) {
      y -= 8;
      drawText(page, `GRX10 is registered with Ministry of MSME, Govt of India. Udyam registration number - ${s.msme_number}`, leftMargin, y, regular, 7, BRAND_COLORS.muted);
      y -= 8;
    }

    y -= 10;

    // Line items table
    const items: QuoteItem[] = quote.quote_items || [];
    const hasGST = items.some((it: QuoteItem) => (it.cgst_rate || 0) > 0 || (it.sgst_rate || 0) > 0 || (it.igst_rate || 0) > 0);
    const hasHSN = items.some((it: QuoteItem) => it.hsn_sac);

    page.drawRectangle({ x: leftMargin, y: y - 5, width: rightEdge - leftMargin, height: 20, color: BRAND_COLORS.dark });

    const headerY = y;
    let colX = leftMargin + 5;
    drawText(page, "#", colX, headerY, bold, 8, BRAND_COLORS.white); colX += 18;
    drawText(page, "Item & Description", colX, headerY, bold, 8, BRAND_COLORS.white); colX += 130;
    if (hasHSN) { drawText(page, "HSN/SAC", colX, headerY, bold, 8, BRAND_COLORS.white); colX += 55; }
    drawText(page, "Qty", colX, headerY, bold, 8, BRAND_COLORS.white); colX += 35;
    drawText(page, "Rate", colX, headerY, bold, 8, BRAND_COLORS.white); colX += 60;
    if (hasGST) {
      drawText(page, "CGST", colX, headerY, bold, 7, BRAND_COLORS.white); colX += 45;
      drawText(page, "SGST", colX, headerY, bold, 7, BRAND_COLORS.white); colX += 45;
    }
    drawText(page, "Amount", colX, headerY, bold, 8, BRAND_COLORS.white);

    y -= 25;

    let rowIdx = 0;
    for (const item of items) {
      if (rowIdx % 2 === 0) {
        page.drawRectangle({ x: leftMargin, y: y - 8, width: rightEdge - leftMargin, height: 20, color: rgb(0.98, 0.98, 0.99) });
      }
      colX = leftMargin + 5;
      drawText(page, String(rowIdx + 1), colX, y, regular, 8, BRAND_COLORS.text); colX += 18;
      drawText(page, (item.description || "Services").substring(0, 35), colX, y, regular, 8, BRAND_COLORS.text); colX += 130;
      if (hasHSN) { drawText(page, item.hsn_sac || "", colX, y, regular, 8, BRAND_COLORS.text); colX += 55; }
      drawText(page, String(item.quantity || 1), colX, y, regular, 8, BRAND_COLORS.text); colX += 35;
      drawText(page, formatCurrency(item.rate), colX, y, regular, 8, BRAND_COLORS.text); colX += 60;
      if (hasGST) {
        drawText(page, `${item.cgst_rate || 0}% / ${formatCurrency(item.cgst_amount || 0)}`, colX, y, regular, 7, BRAND_COLORS.text); colX += 45;
        drawText(page, `${item.sgst_rate || 0}% / ${formatCurrency(item.sgst_amount || 0)}`, colX, y, regular, 7, BRAND_COLORS.text); colX += 45;
      }
      drawText(page, formatCurrency(item.amount), colX, y, bold, 8, BRAND_COLORS.text);
      y -= 20;
      rowIdx++;
    }

    if (items.length === 0) {
      drawText(page, "1", leftMargin + 5, y, regular, 8, BRAND_COLORS.text);
      drawText(page, "Professional Services", leftMargin + 23, y, regular, 8, BRAND_COLORS.text);
      drawText(page, formatCurrency(Number(quote.amount)), rightEdge - 60, y, bold, 8, BRAND_COLORS.text);
      y -= 20;
    }

    page.drawLine({ start: { x: leftMargin, y: y + 10 }, end: { x: rightEdge, y: y + 10 }, thickness: 0.5, color: BRAND_COLORS.tableBorder });
    y -= 5;

    const totalAmount = Number(quote.total_amount) || Number(quote.amount);
    drawText(page, `Total In Words: ${numberToWords(totalAmount)}`, leftMargin, y, regular, 8, BRAND_COLORS.text);
    y -= 20;

    // Totals
    const totalsX = 380;
    const totalsValX = 480;
    const subtotal = Number(quote.subtotal) || Number(quote.amount);
    drawText(page, "Sub Total:", totalsX, y, regular, 9, BRAND_COLORS.muted);
    drawText(page, formatCurrency(subtotal), totalsValX, y, regular, 9, BRAND_COLORS.text); y -= 15;

    const cgstTotal = Number(quote.cgst_total) || 0;
    const sgstTotal = Number(quote.sgst_total) || 0;
    const igstTotal = Number(quote.igst_total) || 0;

    if (cgstTotal > 0) {
      const cgstRate = items.length > 0 ? (items[0].cgst_rate || 0) : 0;
      drawText(page, `CGST (${cgstRate}%):`, totalsX, y, regular, 9, BRAND_COLORS.muted);
      drawText(page, formatCurrency(cgstTotal), totalsValX, y, regular, 9, BRAND_COLORS.text); y -= 15;
    }
    if (sgstTotal > 0) {
      const sgstRate = items.length > 0 ? (items[0].sgst_rate || 0) : 0;
      drawText(page, `SGST (${sgstRate}%):`, totalsX, y, regular, 9, BRAND_COLORS.muted);
      drawText(page, formatCurrency(sgstTotal), totalsValX, y, regular, 9, BRAND_COLORS.text); y -= 15;
    }
    if (igstTotal > 0) {
      const igstRate = items.length > 0 ? (items[0].igst_rate || 0) : 0;
      drawText(page, `IGST (${igstRate}%):`, totalsX, y, regular, 9, BRAND_COLORS.muted);
      drawText(page, formatCurrency(igstTotal), totalsValX, y, regular, 9, BRAND_COLORS.text); y -= 15;
    }

    page.drawRectangle({ x: totalsX - 10, y: y - 8, width: rightEdge - totalsX + 10, height: 25, color: BRAND_COLORS.primary });
    drawText(page, "Total:", totalsX, y, bold, 11, BRAND_COLORS.white);
    drawText(page, `Rs. ${formatCurrency(totalAmount)}`, totalsValX - 10, y, bold, 11, BRAND_COLORS.white);

    y -= 40;

    // Notes
    if (quote.notes) {
      drawText(page, "Notes:", leftMargin, y, bold, 9, BRAND_COLORS.text); y -= 13;
      drawText(page, quote.notes.substring(0, 100), leftMargin, y, regular, 8, BRAND_COLORS.muted); y -= 15;
    }

    // Signature
    if (s.signature_url) {
      try {
        const sigResponse = await fetch(s.signature_url);
        const sigBytes = new Uint8Array(await sigResponse.arrayBuffer());
        const sigContentType = sigResponse.headers.get("content-type") || "";
        const sigImage = sigContentType.includes("png")
          ? await pdfDoc.embedPng(sigBytes)
          : await pdfDoc.embedJpg(sigBytes);
        const sigScale = 40 / sigImage.height;
        page.drawImage(sigImage, { x: rightEdge - 120, y: 80, width: sigImage.width * sigScale, height: 40 });
      } catch (e) {
        console.log("Could not embed signature:", e);
      }
    }
    drawText(page, "Authorized Signature", rightEdge - 130, 70, regular, 8, BRAND_COLORS.muted);

    if (s.custom_footer_text) {
      drawText(page, s.custom_footer_text, leftMargin, 45, regular, 7, BRAND_COLORS.muted);
    }

    page.drawLine({ start: { x: leftMargin, y: 35 }, end: { x: rightEdge, y: 35 }, thickness: 0.5, color: BRAND_COLORS.tableBorder });
    drawText(page, `Generated by GRX10 ERP`, leftMargin, 22, regular, 7, BRAND_COLORS.muted);

    const pdfBytes = await pdfDoc.save();

    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${quote.quote_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating quote PDF:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
