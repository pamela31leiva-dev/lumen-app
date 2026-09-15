import { XMLParser } from 'fast-xml-parser';

/**
 * Parser determinista de facturas electronicas colombianas (XML UBL 2.1,
 * formato exigido por la DIAN). Sin IA, sin OCR: si el XML no trae un campo
 * exigido en la forma exacta que especifica el estandar UBL, se falla con un
 * error explicito en vez de adivinar -- lo contrario romperia "AI propone,
 * Postgres calcula, la persona decide" para el unico dato que aqui SI debe
 * ser 100% exacto (impuestos y totales de una obligacion tributaria real).
 */

const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // cac:/cbc:/fe: varian entre proveedores; el nombre local basta para ubicar el campo.
  parseTagValue: false, // los montos se interpretan a mano (parseUblDecimal) -- nunca se confia en la coercion automatica de tipos.
  parseAttributeValue: false,
  trimValues: true,
} as const;

export interface UblInvoiceParty {
  nit: string | null;
  name: string | null;
}

export interface UblInvoiceTax {
  /** Codigo DIAN del tributo ('01' IVA, '04' INC, '03' ICA, etc.), tal como viene en TaxScheme/ID. */
  schemeCode: string | null;
  schemeName: string | null;
  taxableAmount: number | null;
  taxAmount: number;
  percent: number | null;
}

export interface ParsedUblInvoice {
  ublVersion: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  /** CUFE (Codigo Unico de Facturacion Electronica), cuando el XML lo trae como cbc:UUID schemeName="CUFE-...". */
  cufe: string | null;
  supplier: UblInvoiceParty;
  customer: UblInvoiceParty;
  lineExtensionAmount: number | null;
  taxExclusiveAmount: number | null;
  taxInclusiveAmount: number | null;
  allowanceTotalAmount: number;
  chargeTotalAmount: number;
  payableAmount: number;
  taxes: UblInvoiceTax[];
  totalTaxAmount: number;
}

export type ParseUblInvoiceResult = { success: true; invoice: ParsedUblInvoice } | { success: false; error: string };

type XmlNode = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: unknown): string | null {
  if (node === undefined || node === null) return null;
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object') {
    const text = (node as XmlNode)['#text'];
    if (typeof text === 'string') return text.trim() || null;
    if (typeof text === 'number') return String(text);
  }
  return null;
}

function attrOf(node: unknown, attributeName: string): string | null {
  if (node === null || typeof node !== 'object') return null;
  const value = (node as XmlNode)[`@_${attributeName}`];
  return typeof value === 'string' ? value : null;
}

function child(node: unknown, key: string): unknown {
  if (node === null || typeof node !== 'object') return undefined;
  return (node as XmlNode)[key];
}

/** Solo acepta notacion decimal simple (el unico formato valido segun el xsd:decimal de UBL) -- nunca interpreta separadores de miles ni comas, a diferencia del parser de importacion de extractos. */
function parseUblDecimal(text: string | null): number | null {
  if (text === null) return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function parseParty(partyWrapper: unknown): UblInvoiceParty {
  const party = child(partyWrapper, 'Party');
  const taxSchemes = asArray(child(party, 'PartyTaxScheme'));
  const nitFromTaxScheme = taxSchemes.map((scheme) => textOf(child(scheme, 'CompanyID'))).find((id) => id !== null) ?? null;
  const nitFromIdentification = textOf(child(child(party, 'PartyIdentification'), 'ID'));

  const legalEntity = child(party, 'PartyLegalEntity');
  const nameFromLegalEntity = textOf(child(legalEntity, 'RegistrationName'));
  const nameFromPartyName = textOf(child(child(party, 'PartyName'), 'Name'));

  return {
    nit: nitFromTaxScheme ?? nitFromIdentification,
    name: nameFromLegalEntity ?? nameFromPartyName,
  };
}

function parseTaxes(invoiceNode: unknown): { taxes: UblInvoiceTax[]; totalTaxAmount: number } {
  const taxTotals = asArray(child(invoiceNode, 'TaxTotal'));
  const taxes: UblInvoiceTax[] = [];
  let totalTaxAmount = 0;

  for (const taxTotal of taxTotals) {
    totalTaxAmount += parseUblDecimal(textOf(child(taxTotal, 'TaxAmount'))) ?? 0;

    for (const subtotal of asArray(child(taxTotal, 'TaxSubtotal'))) {
      const category = child(subtotal, 'TaxCategory');
      const scheme = child(category, 'TaxScheme');
      taxes.push({
        schemeCode: textOf(child(scheme, 'ID')),
        schemeName: textOf(child(scheme, 'Name')),
        taxableAmount: parseUblDecimal(textOf(child(subtotal, 'TaxableAmount'))),
        taxAmount: parseUblDecimal(textOf(child(subtotal, 'TaxAmount'))) ?? 0,
        percent: parseUblDecimal(textOf(child(category, 'Percent'))),
      });
    }
  }

  return { taxes, totalTaxAmount };
}

function findCufe(invoiceNode: unknown): string | null {
  const uuidNodes = asArray(child(invoiceNode, 'UUID'));
  const cufeNode = uuidNodes.find((node) => /cufe/i.test(attrOf(node, 'schemeName') ?? ''));
  return textOf(cufeNode ?? uuidNodes[0] ?? null);
}

function findDueDate(invoiceNode: unknown): string | null {
  for (const paymentMeans of asArray(child(invoiceNode, 'PaymentMeans'))) {
    const dueDate = textOf(child(paymentMeans, 'PaymentDueDate'));
    if (dueDate) return dueDate;
  }
  for (const paymentTerms of asArray(child(invoiceNode, 'PaymentTerms'))) {
    const dueDate = textOf(child(paymentTerms, 'PaymentDueDate'));
    if (dueDate) return dueDate;
  }
  return null;
}

/** DIAN entrega frecuentemente un AttachedDocument cuyo contenido real (la factura UBL firmada) va incrustado como texto XML dentro de cac:Attachment/cac:ExternalReference/cbc:Description. */
function locateInvoiceNode(parsed: XmlNode): { invoiceNode: XmlNode } | { error: string } {
  const direct = parsed.Invoice;
  if (direct && typeof direct === 'object') return { invoiceNode: direct as XmlNode };

  const attached = parsed.AttachedDocument;
  if (attached && typeof attached === 'object') {
    const description = textOf(
      child(child(child(attached, 'Attachment'), 'ExternalReference'), 'Description'),
    );
    if (description && description.includes('<Invoice')) {
      try {
        const innerParsed = new XMLParser(XML_PARSER_OPTIONS).parse(description) as XmlNode;
        if (innerParsed.Invoice && typeof innerParsed.Invoice === 'object') {
          return { invoiceNode: innerParsed.Invoice as XmlNode };
        }
      } catch {
        // Cae al error generico de abajo: nunca se adivina el contenido.
      }
    }
    return { error: 'El XML es un AttachedDocument de la DIAN, pero no se encontro la factura (Invoice) incrustada dentro.' };
  }

  return { error: 'El XML no contiene un elemento <Invoice> de UBL 2.1. Verifica que sea el archivo XML de la factura electronica.' };
}

export function parseUblInvoiceXml(xml: string): ParseUblInvoiceResult {
  let parsed: XmlNode;
  try {
    parsed = new XMLParser(XML_PARSER_OPTIONS).parse(xml) as XmlNode;
  } catch (err) {
    return { success: false, error: `El archivo no es un XML valido: ${err instanceof Error ? err.message : 'error desconocido'}.` };
  }

  const located = locateInvoiceNode(parsed);
  if ('error' in located) return { success: false, error: located.error };
  const invoiceNode = located.invoiceNode;

  const invoiceNumber = textOf(child(invoiceNode, 'ID'));
  if (!invoiceNumber) return { success: false, error: 'No se encontro el numero de factura (cbc:ID) en el XML.' };

  const issueDate = textOf(child(invoiceNode, 'IssueDate'));
  if (!issueDate || !/^\d{4}-\d{2}-\d{2}/.test(issueDate)) {
    return { success: false, error: 'No se encontro una fecha de emision valida (cbc:IssueDate) en el XML.' };
  }

  const supplier = parseParty(child(invoiceNode, 'AccountingSupplierParty'));
  if (!supplier.nit) return { success: false, error: 'No se encontro el NIT del emisor (AccountingSupplierParty) en el XML.' };

  const customer = parseParty(child(invoiceNode, 'AccountingCustomerParty'));
  if (!customer.nit) return { success: false, error: 'No se encontro el NIT del receptor (AccountingCustomerParty) en el XML.' };

  const monetaryTotal = child(invoiceNode, 'LegalMonetaryTotal');
  const payableAmount = parseUblDecimal(textOf(child(monetaryTotal, 'PayableAmount')));
  if (payableAmount === null) return { success: false, error: 'No se encontro el total a pagar (cbc:PayableAmount) en el XML.' };

  const { taxes, totalTaxAmount } = parseTaxes(invoiceNode);

  const invoice: ParsedUblInvoice = {
    ublVersion: textOf(child(invoiceNode, 'UBLVersionID')),
    invoiceNumber,
    issueDate: issueDate.slice(0, 10),
    dueDate: findDueDate(invoiceNode),
    currency: textOf(child(invoiceNode, 'DocumentCurrencyCode')) ?? 'COP',
    cufe: findCufe(invoiceNode),
    supplier,
    customer,
    lineExtensionAmount: parseUblDecimal(textOf(child(monetaryTotal, 'LineExtensionAmount'))),
    taxExclusiveAmount: parseUblDecimal(textOf(child(monetaryTotal, 'TaxExclusiveAmount'))),
    taxInclusiveAmount: parseUblDecimal(textOf(child(monetaryTotal, 'TaxInclusiveAmount'))),
    allowanceTotalAmount: parseUblDecimal(textOf(child(monetaryTotal, 'AllowanceTotalAmount'))) ?? 0,
    chargeTotalAmount: parseUblDecimal(textOf(child(monetaryTotal, 'ChargeTotalAmount'))) ?? 0,
    payableAmount,
    taxes,
    totalTaxAmount,
  };

  return { success: true, invoice };
}
