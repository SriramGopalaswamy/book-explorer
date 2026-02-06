import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  amount: number;
  due_date: string;
  status: string;
  created_at: string;
  invoice_items: InvoiceItem[];
}

// Company branding configuration
const COMPANY_INFO = {
  name: "GRX10",
  tagline: "Business Suite",
  address: "123 Business Park, Tech Hub",
  city: "Mumbai, Maharashtra 400001",
  country: "India",
  email: "billing@grx10.com",
  phone: "+91 22 1234 5678",
  website: "www.grx10.com",
  gstin: "27XXXXX1234X1ZX", // GST Number
};

// Brand colors (Magenta accent from grx10.com)
const BRAND_COLORS = {
  primary: rgb(0.85, 0.15, 0.55), // Magenta #D9268C
  primaryDark: rgb(0.65, 0.1, 0.42),
  dark: rgb(0.13, 0.12, 0.15), // Dark background
  text: rgb(0.15, 0.15, 0.18),
  muted: rgb(0.45, 0.47, 0.5),
  light: rgb(0.97, 0.97, 0.98),
  white: rgb(1, 1, 1),
};

const formatCurrency = (amount: number): string => {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

serve(async (req) => {
  console.log("Generate Invoice PDF: Request received");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("Authentication failed:", userError?.message);
      throw new Error("Unauthorized");
    }

    const { invoiceId } = await req.json();
    if (!invoiceId) {
      console.error("Invoice ID not provided");
      throw new Error("Invoice ID is required");
    }

    console.log(`Fetching invoice: ${invoiceId}`);

    // Fetch the invoice with items
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select(`*, invoice_items(*)`)
      .eq("id", invoiceId)
      .eq("user_id", user.id)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice not found:", invoiceError?.message);
      throw new Error("Invoice not found");
    }

    console.log(`Generating PDF for invoice: ${invoice.invoice_number}`);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
    const { width, height } = page.getSize();

    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let y = height - 50;

    // ========== HEADER WITH BRANDING ==========
    
    // Draw branded header bar
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width: width,
      height: 100,
      color: BRAND_COLORS.dark,
    });

    // Company Logo Text (stylized)
    page.drawText(COMPANY_INFO.name, {
      x: 50,
      y: height - 50,
      size: 28,
      font: helveticaBold,
      color: BRAND_COLORS.primary,
    });

    // Company Tagline
    page.drawText(COMPANY_INFO.tagline, {
      x: 50,
      y: height - 72,
      size: 12,
      font: helvetica,
      color: BRAND_COLORS.white,
    });

    // Invoice label on the right
    page.drawText("INVOICE", {
      x: width - 130,
      y: height - 55,
      size: 24,
      font: helveticaBold,
      color: BRAND_COLORS.white,
    });

    // Invoice number
    page.drawText(invoice.invoice_number, {
      x: width - 130,
      y: height - 78,
      size: 12,
      font: helvetica,
      color: BRAND_COLORS.primary,
    });

    y = height - 130;

    // ========== COMPANY & CLIENT INFO ==========

    // From Section (Company)
    page.drawText("FROM", {
      x: 50,
      y,
      size: 9,
      font: helveticaBold,
      color: BRAND_COLORS.muted,
    });

    // To Section (Client)
    page.drawText("BILL TO", {
      x: 300,
      y,
      size: 9,
      font: helveticaBold,
      color: BRAND_COLORS.muted,
    });

    y -= 18;

    // Company details
    page.drawText(COMPANY_INFO.name, {
      x: 50,
      y,
      size: 11,
      font: helveticaBold,
      color: BRAND_COLORS.text,
    });

    page.drawText(invoice.client_name, {
      x: 300,
      y,
      size: 11,
      font: helveticaBold,
      color: BRAND_COLORS.text,
    });

    y -= 14;

    page.drawText(COMPANY_INFO.address, {
      x: 50,
      y,
      size: 9,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });

    page.drawText(invoice.client_email, {
      x: 300,
      y,
      size: 9,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });

    y -= 12;

    page.drawText(COMPANY_INFO.city, {
      x: 50,
      y,
      size: 9,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });

    y -= 12;

    page.drawText(COMPANY_INFO.email, {
      x: 50,
      y,
      size: 9,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });

    y -= 12;

    page.drawText(`GSTIN: ${COMPANY_INFO.gstin}`, {
      x: 50,
      y,
      size: 9,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });

    y -= 35;

    // ========== INVOICE DETAILS BOX ==========

    // Details background
    page.drawRectangle({
      x: 50,
      y: y - 50,
      width: width - 100,
      height: 55,
      color: BRAND_COLORS.light,
    });

    const detailsY = y - 15;

    // Issue Date
    page.drawText("Issue Date", {
      x: 60,
      y: detailsY,
      size: 8,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });
    page.drawText(formatDate(invoice.created_at), {
      x: 60,
      y: detailsY - 14,
      size: 10,
      font: helveticaBold,
      color: BRAND_COLORS.text,
    });

    // Due Date
    page.drawText("Due Date", {
      x: 180,
      y: detailsY,
      size: 8,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });
    page.drawText(formatDate(invoice.due_date), {
      x: 180,
      y: detailsY - 14,
      size: 10,
      font: helveticaBold,
      color: BRAND_COLORS.text,
    });

    // Status
    page.drawText("Status", {
      x: 320,
      y: detailsY,
      size: 8,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });
    
    const statusColor = invoice.status === "paid" ? rgb(0.13, 0.55, 0.13) : 
                        invoice.status === "overdue" ? rgb(0.8, 0.2, 0.2) :
                        BRAND_COLORS.primary;
    page.drawText(invoice.status.toUpperCase(), {
      x: 320,
      y: detailsY - 14,
      size: 10,
      font: helveticaBold,
      color: statusColor,
    });

    // Amount Due
    page.drawText("Amount Due", {
      x: 440,
      y: detailsY,
      size: 8,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });
    page.drawText(formatCurrency(Number(invoice.amount)), {
      x: 440,
      y: detailsY - 14,
      size: 12,
      font: helveticaBold,
      color: BRAND_COLORS.primary,
    });

    y -= 80;

    // ========== LINE ITEMS TABLE ==========

    // Table header with brand color
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: width - 100,
      height: 28,
      color: BRAND_COLORS.dark,
    });

    const tableHeaderY = y + 3;
    page.drawText("Description", { x: 60, y: tableHeaderY, size: 10, font: helveticaBold, color: BRAND_COLORS.white });
    page.drawText("Qty", { x: 330, y: tableHeaderY, size: 10, font: helveticaBold, color: BRAND_COLORS.white });
    page.drawText("Rate", { x: 390, y: tableHeaderY, size: 10, font: helveticaBold, color: BRAND_COLORS.white });
    page.drawText("Amount", { x: 480, y: tableHeaderY, size: 10, font: helveticaBold, color: BRAND_COLORS.white });

    y -= 35;

    // Table rows
    const items = invoice.invoice_items || [];
    let rowIndex = 0;
    for (const item of items) {
      // Alternate row background
      if (rowIndex % 2 === 0) {
        page.drawRectangle({
          x: 50,
          y: y - 8,
          width: width - 100,
          height: 25,
          color: rgb(0.98, 0.98, 0.99),
        });
      }

      page.drawText(item.description || "Services", { x: 60, y, size: 10, font: helvetica, color: BRAND_COLORS.text });
      page.drawText(String(item.quantity), { x: 335, y, size: 10, font: helvetica, color: BRAND_COLORS.text });
      page.drawText(formatCurrency(item.rate), { x: 390, y, size: 10, font: helvetica, color: BRAND_COLORS.text });
      page.drawText(formatCurrency(item.amount), { x: 480, y, size: 10, font: helveticaBold, color: BRAND_COLORS.text });
      y -= 25;
      rowIndex++;
    }

    // If no items, show placeholder
    if (items.length === 0) {
      page.drawText("Professional Services", { x: 60, y, size: 10, font: helvetica, color: BRAND_COLORS.text });
      page.drawText("1", { x: 335, y, size: 10, font: helvetica, color: BRAND_COLORS.text });
      page.drawText(formatCurrency(Number(invoice.amount)), { x: 390, y, size: 10, font: helvetica, color: BRAND_COLORS.text });
      page.drawText(formatCurrency(Number(invoice.amount)), { x: 480, y, size: 10, font: helveticaBold, color: BRAND_COLORS.text });
      y -= 25;
    }

    y -= 15;

    // ========== TOTALS SECTION ==========

    // Subtotal
    page.drawText("Subtotal", { x: 390, y, size: 10, font: helvetica, color: BRAND_COLORS.muted });
    page.drawText(formatCurrency(Number(invoice.amount)), { x: 480, y, size: 10, font: helvetica, color: BRAND_COLORS.text });

    y -= 18;

    // Tax (placeholder - can be made dynamic)
    page.drawText("Tax (0%)", { x: 390, y, size: 10, font: helvetica, color: BRAND_COLORS.muted });
    page.drawText("₹0.00", { x: 480, y, size: 10, font: helvetica, color: BRAND_COLORS.text });

    y -= 25;

    // Total with accent bar
    page.drawRectangle({
      x: 380,
      y: y - 8,
      width: width - 430,
      height: 30,
      color: BRAND_COLORS.primary,
    });

    page.drawText("TOTAL", { x: 390, y, size: 11, font: helveticaBold, color: BRAND_COLORS.white });
    page.drawText(formatCurrency(Number(invoice.amount)), { x: 480, y, size: 12, font: helveticaBold, color: BRAND_COLORS.white });

    // ========== FOOTER ==========

    // Footer divider
    page.drawLine({
      start: { x: 50, y: 100 },
      end: { x: width - 50, y: 100 },
      thickness: 1,
      color: rgb(0.9, 0.9, 0.9),
    });

    // Thank you message
    page.drawText("Thank you for your business!", {
      x: 50,
      y: 75,
      size: 11,
      font: helveticaBold,
      color: BRAND_COLORS.text,
    });

    page.drawText("Payment is due within the terms specified above. Please include the invoice number with your payment.", {
      x: 50,
      y: 58,
      size: 8,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });

    // Company footer
    page.drawText(`${COMPANY_INFO.name} | ${COMPANY_INFO.website} | ${COMPANY_INFO.phone}`, {
      x: 50,
      y: 35,
      size: 8,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });

    // Powered by badge (right aligned)
    page.drawText("Powered by GRX10 Business Suite", {
      x: width - 170,
      y: 35,
      size: 7,
      font: helvetica,
      color: BRAND_COLORS.muted,
    });

    // Save PDF
    const pdfBytes = await pdfDoc.save();

    console.log(`PDF generated successfully for ${invoice.invoice_number}`);

    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
