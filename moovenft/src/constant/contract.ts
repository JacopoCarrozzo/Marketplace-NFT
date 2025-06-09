import CONTRACT_ABI from "../utils/abi.json";
import berlin from "../assets/images/berlin.jpg";
import paris from "../assets/images/paris.jpg";
import rome from "../assets/images/rome.jpg";
import madrid from "../assets/images/madrid.jpg";
import amsterdam from "../assets/images/amsterdam.jpg";
import frankfurt from "../assets/images/frankfurt.jpg";
import london from "../assets/images/london.jpg";
import dublin from "../assets/images/dublin.jpg";
import brussels from "../assets/images/brussel.jpg";
import zurich from "../assets/images/zurich.jpg";
import milan from "../assets/images/milan.jpg";
import barcelona from "../assets/images/barcellona.jpg";
import florence from "../assets/images/florence.jpg";
import rotterdam from "../assets/images/rotterdam.jpg";
import naples from "../assets/images/naples.jpg";

export const CONTRACT_ADDRESS = "0x34d73f46b7e25eeb0a4784b210d8cc998e0b1dda";

export const CITY_IMAGES: { [key: string]: string } = {
  Berlin: berlin,
  Paris: paris,
  Rome: rome,
  Madrid: madrid,
  Amsterdam: amsterdam,
  Frankfurt: frankfurt,
  London: london,
  Dublin: dublin,
  Brussels: brussels,
  Zurich: zurich,
  Milan: milan,
  Barcelona: barcelona,
  Florence: florence,
  Rotterdam: rotterdam,
  Naples: naples,
};

export { CONTRACT_ABI };