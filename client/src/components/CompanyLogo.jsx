export default function CompanyLogo({ compact = false, alt = 'BrainADZ — Marketing | Live | Exhibits' }) {
  return <img className={`company-logo${compact ? ' compact' : ''}`} src={`${import.meta.env.BASE_URL}main-logo.png`} alt={alt} width="500" height="146" />;
}
