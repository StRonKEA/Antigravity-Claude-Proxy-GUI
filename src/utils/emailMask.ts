/**
 * Masks an email address for privacy
 * Shows first 3 chars, masks rest with asterisks, keeps same length
 * Example: ercument@gmail.com -> erc*****@g****.com
 */
export function maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email;

    const [localPart, domain] = email.split('@');
    const [domainName, ...tld] = domain.split('.');

    // Mask local part: show first 3 chars, rest asterisks
    const maskedLocal = localPart.length > 3
        ? localPart.slice(0, 3) + '*'.repeat(localPart.length - 3)
        : localPart;

    // Mask domain: show first char, rest asterisks
    const maskedDomain = domainName.length > 1
        ? domainName.slice(0, 1) + '*'.repeat(domainName.length - 1)
        : domainName;

    return `${maskedLocal}@${maskedDomain}.${tld.join('.')}`;
}
