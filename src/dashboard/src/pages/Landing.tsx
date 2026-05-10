import LandingNav from '../components/landing/LandingNav';
import HeroSection from '../components/landing/HeroSection';
import InfraSection from '../components/landing/InfraSection';
import PlatformSection from '../components/landing/PlatformSection';
import StatsBar from '../components/landing/StatsBar';
import SecuritySection from '../components/landing/SecuritySection';
import NewsSection from '../components/landing/NewsSection';
import CtaSection from '../components/landing/CtaSection';
import LandingFooter from '../components/landing/LandingFooter';

export default function Landing() {
  return (
    <main className="landing-page">
      <div className="landing-content">
        <LandingNav />
        <HeroSection />
        <InfraSection />
        <PlatformSection />
        <StatsBar />
        <div className="bottomGrid">
          <SecuritySection />
          <NewsSection />
        </div>
        <CtaSection />
        <LandingFooter />
      </div>
    </main>
  );
}
