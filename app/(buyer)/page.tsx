"use client";
import PremiumPicksPage from "@/components/PremiumPicksPage";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ToolsHub } from "@/components/ToolsHub";
function BuyerPage() {
  return (
    <div>
      <Navbar/>
      <PremiumPicksPage/>
      <Footer/>
      <ToolsHub/>
    </div>
  )
}

export default BuyerPage