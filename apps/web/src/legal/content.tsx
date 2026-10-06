import type { ReactNode } from "react";
import { linkProps } from "../lib/router";
import { ISSUES_URL, REPO_URL } from "./policy";

// Privacy Policy and Terms, in English and Thai. Every statement here must match what the code and the
// server actually do; policy.test.ts forces a re-read when data-handling code changes.

export type Lang = "en" | "th";
export type LegalKind = "privacy" | "terms";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-12">
    <h2 className="text-xl font-semibold tracking-tight text-neutral-950">{title}</h2>
    <div className="mt-4 grid gap-4 leading-relaxed text-neutral-700">{children}</div>
  </section>;
}

function List({ children }: { children: ReactNode }) {
  return <ul className="grid list-disc gap-2.5 pl-5 marker:text-neutral-400">{children}</ul>;
}

const A = ({ href, children }: { href: string; children: ReactNode }) =>
  <a href={href} target="_blank" rel="noreferrer" className="font-medium text-amber-700 underline decoration-amber-400/60 underline-offset-4 hover:decoration-amber-600">{children}</a>;

const Internal = ({ to, children }: { to: string; children: ReactNode }) =>
  <a {...linkProps(to)} className="font-medium text-amber-700 underline decoration-amber-400/60 underline-offset-4 hover:decoration-amber-600">{children}</a>;

const Issues = ({ children }: { children: ReactNode }) => <A href={ISSUES_URL}>{children}</A>;

export const TITLES: Record<LegalKind, Record<Lang, string>> = {
  privacy: { en: "Privacy Policy", th: "นโยบายความเป็นส่วนตัว" },
  terms: { en: "Terms of Service", th: "ข้อกำหนดการใช้บริการ" },
};

export const INTROS: Record<LegalKind, Record<Lang, string>> = {
  privacy: {
    en: "DeezNote is built so that we can't read your notes. This page explains the little we do store, why, and for how long.",
    th: "DeezNote ถูกออกแบบให้เราอ่านโน้ตของคุณไม่ได้ หน้านี้อธิบายข้อมูลเพียงเล็กน้อยที่เราเก็บ เหตุผลที่เก็บ และระยะเวลาที่เก็บ",
  },
  terms: {
    en: "The rules for using DeezNote. They're short, because the service is simple.",
    th: "กติกาการใช้งาน DeezNote ซึ่งสั้นและเรียบง่ายเหมือนตัวบริการ",
  },
};

export function PrivacyEn() {
  return <>
    <Section title="Who we are">
      <p>DeezNote is an open-source notes app run by its developer, the maintainer of <A href={REPO_URL}>github.com/KantaKan/DeezNote</A>. For this policy, "we" means that developer, the data controller under Thailand's Personal Data Protection Act (PDPA).</p>
    </Section>
    <Section title="What we can't see">
      <p>Your notes are encrypted in your browser before they leave your device. The title, text, tags, images, favourite and colour of every note travel and rest as ciphertext. Your vault passphrase never reaches our server, so we have no way to decrypt them, and nor does anyone who gets hold of our server.</p>
    </Section>
    <Section title="What we store">
      <List>
        <li><strong>Your account:</strong> your email address, your account password stored only as an Argon2id hash, and your plan (Free or Pro). Your storage use is worked out from the encrypted size of your notes.</li>
        <li><strong>Your encrypted vault:</strong> your vault key, encrypted in your browser with your passphrase, plus the salt and nonce needed to unlock it there.</li>
        <li><strong>Your encrypted notes:</strong> the ciphertext described above, plus a random note ID, a version number and the time each note was last saved.</li>
        <li><strong>Sign-in sessions:</strong> a hash of each session token and when it expires (30 days after signing in).</li>
        <li><strong>Access logs:</strong> for each request to the site, the IP address and port, time, method, the address requested, and the response status, size and duration. Request headers, sign-in tokens and cookies are not logged. Thailand's Computer-Related Crime Act requires service providers to keep this traffic data for at least 90 days.</li>
        <li><strong>Abuse counters:</strong> to block brute-force and spam, the server counts recent requests per IP address and sign-in attempts per email, in memory only. These counters reset within an hour and are never written to disk.</li>
      </List>
    </Section>
    <Section title="On your device">
      <p>Your browser keeps an encrypted copy of your notes (IndexedDB) so the app works offline, and stores your session token, your email and a few display preferences (theme, page language and whether you've seen the welcome tour) in local storage. Signing out clears the token and the local notes. We don't use cookies.</p>
    </Section>
    <Section title="What we don't do">
      <List>
        <li>No advertising, analytics or tracking scripts. The site loads nothing from third parties.</li>
        <li>We don't sell or share your data. We would only disclose what we hold (never readable notes, which we don't have) if Thai law requires it.</li>
      </List>
    </Section>
    <Section title="Where it's stored">
      <p>Everything runs on one server rented from DigitalOcean in Singapore, so your data is stored outside Thailand. DigitalOcean only provides the machine; it is not given access to the app's data.</p>
    </Section>
    <Section title="Why we process it">
      <List>
        <li>To provide the service you signed up for (your account, vault, notes and sessions).</li>
        <li>To meet legal obligations (access logs under the Computer-Related Crime Act).</li>
        <li>For our legitimate interest in keeping the service secure (abuse counters and logs).</li>
      </List>
    </Section>
    <Section title="How long we keep it">
      <List>
        <li>Account, vault and notes: until you delete a note or your account.</li>
        <li>Sessions: until you sign out or they expire after 30 days.</li>
        <li>Access logs: 100 days, then deleted automatically.</li>
        <li>Backups: a copy of the server database is made every day and kept for 14 days, then deleted automatically. It holds the same data listed above, and your notes stay encrypted in it. Anything you delete is gone from the backups within 14 days.</li>
      </List>
    </Section>
    <Section title="Your rights">
      <p>Under the PDPA you can ask to access, correct, move or delete your personal data, object to or restrict its processing, and complain to Thailand's Personal Data Protection Committee.</p>
      <List>
        <li><strong>Delete everything yourself:</strong> in the app, open your profile and choose Delete account. It removes your account, vault, notes and sessions from the live database immediately, and from backups within 14 days. Access logs stay for their 100-day legal period.</li>
        <li><strong>Get or fix your data:</strong> your notes are readable in the app. To change your email or ask what we hold, open a <Issues>GitHub issue</Issues> without putting any personal details in it, and we'll reply with a private way to verify you.</li>
      </List>
    </Section>
    <Section title="Security">
      <p>Notes use XChaCha20-Poly1305 with keys derived by Argon2id from your passphrase, and each note has its own random key. The code is public, but it has not had an independent security audit yet. If you forget your passphrase, nobody can recover your notes.</p>
    </Section>
    <Section title="Children">
      <p>If you are under 20, the age of majority in Thailand, please use DeezNote with a parent's or guardian's permission.</p>
    </Section>
    <Section title="Changes and contact">
      <p>When what we collect or how we use it changes, we update this page and the date at the top. Questions go to <Issues>GitHub issues</Issues>. Please don't post personal details there. See also the <Internal to="/terms">Terms of Service</Internal>.</p>
    </Section>
  </>;
}

export function PrivacyTh() {
  return <>
    <Section title="เราคือใคร">
      <p>DeezNote เป็นแอปจดโน้ตแบบโอเพนซอร์สที่ดูแลโดยผู้พัฒนา ซึ่งเป็นเจ้าของ <A href={REPO_URL}>github.com/KantaKan/DeezNote</A> คำว่า "เรา" ในนโยบายนี้หมายถึงผู้พัฒนาดังกล่าว ในฐานะผู้ควบคุมข้อมูลส่วนบุคคลตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</p>
    </Section>
    <Section title="สิ่งที่เรามองไม่เห็น">
      <p>โน้ตของคุณถูกเข้ารหัสในเบราว์เซอร์ก่อนออกจากอุปกรณ์ ชื่อ เนื้อหา แท็ก รูปภาพ การติดดาว และสีของโน้ตทุกอัน ถูกส่งและจัดเก็บในรูปแบบที่เข้ารหัสแล้ว รหัสผ่านคลัง (vault passphrase) ของคุณไม่เคยถูกส่งมาที่เซิร์ฟเวอร์ เราจึงถอดรหัสโน้ตของคุณไม่ได้ และผู้ที่เข้าถึงเซิร์ฟเวอร์ของเราได้ก็ถอดรหัสไม่ได้เช่นกัน</p>
    </Section>
    <Section title="ข้อมูลที่เราเก็บ">
      <List>
        <li><strong>บัญชีของคุณ:</strong> อีเมล รหัสผ่านบัญชีซึ่งเก็บเฉพาะในรูปแบบแฮช Argon2id และแพ็กเกจของคุณ (Free หรือ Pro) ส่วนพื้นที่ที่ใช้ไปคำนวณจากขนาดของโน้ตที่เข้ารหัสแล้ว</li>
        <li><strong>คลังที่เข้ารหัส:</strong> กุญแจคลังที่ถูกเข้ารหัสในเบราว์เซอร์ด้วยรหัสผ่านคลังของคุณ พร้อมค่า salt และ nonce ที่ใช้ปลดล็อกในเบราว์เซอร์</li>
        <li><strong>โน้ตที่เข้ารหัส:</strong> ข้อมูลเข้ารหัสตามที่อธิบายข้างต้น พร้อมรหัสโน้ตแบบสุ่ม หมายเลขเวอร์ชัน และเวลาที่บันทึกล่าสุด</li>
        <li><strong>เซสชันการเข้าสู่ระบบ:</strong> ค่าแฮชของโทเคนเซสชัน และเวลาหมดอายุ (30 วันหลังเข้าสู่ระบบ)</li>
        <li><strong>ข้อมูลจราจรทางคอมพิวเตอร์ (log):</strong> สำหรับแต่ละคำขอที่เข้ามายังเว็บไซต์ เราเก็บหมายเลข IP และพอร์ต เวลา เมธอด ที่อยู่ที่ร้องขอ สถานะ ขนาด และระยะเวลาของการตอบกลับ โดยไม่บันทึก header ของคำขอ โทเคนเข้าสู่ระบบ หรือคุกกี้ ทั้งนี้ตามที่พระราชบัญญัติว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์กำหนดให้ผู้ให้บริการเก็บไว้ไม่น้อยกว่า 90 วัน</li>
        <li><strong>ตัวนับเพื่อป้องกันการโจมตี:</strong> เพื่อป้องกันการเดารหัสผ่านและสแปม เซิร์ฟเวอร์จะนับจำนวนคำขอล่าสุดต่อหมายเลข IP และจำนวนครั้งที่พยายามเข้าสู่ระบบต่ออีเมล โดยเก็บไว้ในหน่วยความจำเท่านั้น ตัวนับจะรีเซ็ตภายในหนึ่งชั่วโมงและไม่ถูกบันทึกลงดิสก์</li>
      </List>
    </Section>
    <Section title="ข้อมูลบนอุปกรณ์ของคุณ">
      <p>เบราว์เซอร์ของคุณเก็บสำเนาโน้ตที่เข้ารหัสไว้ (IndexedDB) เพื่อให้แอปใช้งานแบบออฟไลน์ได้ และเก็บโทเคนเซสชัน อีเมล และค่าการแสดงผลบางอย่าง (ธีม ภาษาของหน้า และสถานะว่าคุณดูทัวร์แนะนำแล้วหรือยัง) ไว้ใน local storage เมื่อออกจากระบบ โทเคนและโน้ตในเครื่องจะถูกลบ เราไม่ใช้คุกกี้</p>
    </Section>
    <Section title="สิ่งที่เราไม่ทำ">
      <List>
        <li>ไม่มีโฆษณา ไม่มีระบบวิเคราะห์หรือสคริปต์ติดตามใดๆ เว็บไซต์ไม่โหลดอะไรจากบุคคลที่สาม</li>
        <li>เราไม่ขายหรือแบ่งปันข้อมูลของคุณ เราจะเปิดเผยข้อมูลที่เรามี (ซึ่งไม่รวมเนื้อหาโน้ตที่อ่านได้ เพราะเราไม่มี) เฉพาะเมื่อกฎหมายไทยบังคับเท่านั้น</li>
      </List>
    </Section>
    <Section title="สถานที่จัดเก็บข้อมูล">
      <p>ระบบทั้งหมดทำงานบนเซิร์ฟเวอร์เครื่องเดียวที่เช่าจาก DigitalOcean ในประเทศสิงคโปร์ ข้อมูลของคุณจึงถูกจัดเก็บนอกประเทศไทย DigitalOcean ให้บริการเฉพาะตัวเครื่อง และไม่ได้รับสิทธิ์เข้าถึงข้อมูลของแอป</p>
    </Section>
    <Section title="เหตุผลในการประมวลผลข้อมูล">
      <List>
        <li>เพื่อให้บริการตามที่คุณสมัครใช้ (บัญชี คลัง โน้ต และเซสชัน)</li>
        <li>เพื่อปฏิบัติตามกฎหมาย (การเก็บข้อมูลจราจรทางคอมพิวเตอร์ตามพระราชบัญญัติว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์)</li>
        <li>เพื่อประโยชน์โดยชอบด้วยกฎหมายในการรักษาความปลอดภัยของบริการ (ตัวนับป้องกันการโจมตีและ log)</li>
      </List>
    </Section>
    <Section title="ระยะเวลาการเก็บรักษา">
      <List>
        <li>บัญชี คลัง และโน้ต: จนกว่าคุณจะลบโน้ตหรือลบบัญชี</li>
        <li>เซสชัน: จนกว่าคุณจะออกจากระบบ หรือหมดอายุเมื่อครบ 30 วัน</li>
        <li>ข้อมูลจราจรทางคอมพิวเตอร์: 100 วัน แล้วลบโดยอัตโนมัติ</li>
        <li>การสำรองข้อมูล: เราทำสำเนาฐานข้อมูลของเซิร์ฟเวอร์ทุกวันและเก็บไว้ 14 วัน จากนั้นจะถูกลบโดยอัตโนมัติ สำเนานี้มีข้อมูลชุดเดียวกับที่ระบุไว้ข้างต้น และโน้ตของคุณยังคงถูกเข้ารหัสอยู่ ข้อมูลที่คุณลบจะหายไปจากสำเนาสำรองภายใน 14 วัน</li>
      </List>
    </Section>
    <Section title="สิทธิของคุณ">
      <p>ตาม PDPA คุณมีสิทธิขอเข้าถึง แก้ไข โอนย้าย หรือลบข้อมูลส่วนบุคคลของคุณ คัดค้านหรือขอให้ระงับการประมวลผล และร้องเรียนต่อคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล</p>
      <List>
        <li><strong>ลบทุกอย่างด้วยตัวเอง:</strong> ในแอป เปิดโปรไฟล์ของคุณแล้วเลือก Delete account ระบบจะลบบัญชี คลัง โน้ต และเซสชันของคุณออกจากฐานข้อมูลที่ใช้งานอยู่ทันที และออกจากสำเนาสำรองภายใน 14 วัน ส่วนข้อมูลจราจรทางคอมพิวเตอร์จะถูกเก็บไว้จนครบ 100 วันตามที่กฎหมายกำหนด</li>
        <li><strong>ขอดูหรือแก้ไขข้อมูล:</strong> คุณอ่านโน้ตของตัวเองได้ในแอป หากต้องการเปลี่ยนอีเมลหรือสอบถามว่าเราเก็บข้อมูลอะไรไว้ โปรดเปิด <Issues>GitHub issue</Issues> โดยไม่ใส่ข้อมูลส่วนบุคคลใดๆ แล้วเราจะตอบกลับพร้อมช่องทางส่วนตัวสำหรับยืนยันตัวตน</li>
      </List>
    </Section>
    <Section title="ความปลอดภัย">
      <p>โน้ตถูกเข้ารหัสด้วย XChaCha20-Poly1305 โดยใช้กุญแจที่สร้างจากรหัสผ่านคลังของคุณผ่าน Argon2id และโน้ตแต่ละอันมีกุญแจสุ่มของตัวเอง โค้ดเปิดให้ทุกคนตรวจสอบได้ แต่ยังไม่ผ่านการตรวจสอบความปลอดภัยโดยหน่วยงานอิสระ หากคุณลืมรหัสผ่านคลัง จะไม่มีใครกู้คืนโน้ตของคุณได้</p>
    </Section>
    <Section title="ผู้เยาว์">
      <p>หากคุณอายุต่ำกว่า 20 ปี ซึ่งเป็นอายุบรรลุนิติภาวะตามกฎหมายไทย โปรดใช้ DeezNote โดยได้รับความยินยอมจากผู้ปกครอง</p>
    </Section>
    <Section title="การเปลี่ยนแปลงและการติดต่อ">
      <p>เมื่อข้อมูลที่เราเก็บหรือวิธีที่เราใช้ข้อมูลเปลี่ยนไป เราจะปรับปรุงหน้านี้และวันที่ด้านบน หากมีคำถาม โปรดติดต่อผ่าน <Issues>GitHub issues</Issues> และอย่าโพสต์ข้อมูลส่วนบุคคลไว้ที่นั่น ดูเพิ่มเติมได้ที่<Internal to="/terms">ข้อกำหนดการใช้บริการ</Internal></p>
    </Section>
  </>;
}

export function TermsEn() {
  return <>
    <Section title="Agreement">
      <p>By creating an account or using DeezNote, you agree to these terms and to the <Internal to="/privacy">Privacy Policy</Internal>. If you don't agree, please don't use the service.</p>
    </Section>
    <Section title="The service">
      <p>DeezNote is a free, open-source personal project, provided as is. We try to keep it running, but we don't guarantee that it will always be available, and we may change or close it. If we plan to close it, we'll give notice on the site where we reasonably can, so you can copy your notes.</p>
    </Section>
    <Section title="Plans and storage limits">
      <p>Every account starts on Free. Limits are measured on the encrypted size of your notes, because that is all our server can see.</p>
      <List>
        <li><strong>Free:</strong> up to 256 KB per note and 25 MB in total.</li>
        <li><strong>Pro:</strong> up to 8 MB per note and 1 GB in total. Pro is not on sale yet; its price and payment terms will be added here before it is.</li>
      </List>
      <p>A change that goes over your limit stays saved on your device and syncs once the note fits. We may change the limits; if a change would affect notes you already have, we'll give notice first.</p>
    </Section>
    <Section title="Your account and passphrase">
      <List>
        <li>Keep your account password and your vault passphrase safe. You are responsible for what happens under your account.</li>
        <li>We can't reset or recover your vault passphrase. If you lose it, your notes are permanently unreadable, by you and by us.</li>
        <li>Keep your own copies of anything important.</li>
      </List>
    </Section>
    <Section title="Acceptable use">
      <p>Don't use DeezNote to:</p>
      <List>
        <li>store or share anything that is illegal under Thai law, or that you have no right to store;</li>
        <li>attack, overload or probe the service, or get around its rate limits or security;</li>
        <li>access other people's accounts or data;</li>
        <li>run automated bulk sign-ups or heavy automated traffic.</li>
      </List>
    </Section>
    <Section title="Your content">
      <p>Your notes belong to you. Because they are encrypted in your browser, we can't read them. You give us only the permission we need to store your encrypted data and send it back to your devices.</p>
    </Section>
    <Section title="Suspension and deletion">
      <p>You can delete your account at any time from the app. We may suspend or delete an account that breaks these terms, puts the service at risk, or when required by a lawful order.</p>
    </Section>
    <Section title="Liability">
      <p>The service is provided without warranties of any kind. Its encryption has not had an independent audit. To the extent allowed by Thai law, we are not liable for lost data, lost access or other damage arising from using DeezNote.</p>
    </Section>
    <Section title="Law and changes">
      <p>These terms are governed by the laws of Thailand. If they change, we'll update this page and the date at the top; continuing to use DeezNote after that means you accept the new terms. Questions go to <Issues>GitHub issues</Issues>.</p>
    </Section>
  </>;
}

export function TermsTh() {
  return <>
    <Section title="การยอมรับข้อกำหนด">
      <p>เมื่อคุณสร้างบัญชีหรือใช้งาน DeezNote ถือว่าคุณยอมรับข้อกำหนดนี้และ<Internal to="/privacy">นโยบายความเป็นส่วนตัว</Internal> หากคุณไม่ยอมรับ โปรดอย่าใช้บริการ</p>
    </Section>
    <Section title="ตัวบริการ">
      <p>DeezNote เป็นโปรเจกต์ส่วนตัวแบบโอเพนซอร์สที่ให้บริการฟรีตามสภาพที่เป็นอยู่ เราพยายามดูแลให้ระบบทำงานได้ แต่ไม่รับประกันว่าจะใช้งานได้ตลอดเวลา และอาจเปลี่ยนแปลงหรือปิดบริการได้ หากเราวางแผนจะปิดบริการ เราจะแจ้งบนเว็บไซต์ล่วงหน้าเท่าที่ทำได้อย่างสมเหตุสมผล เพื่อให้คุณคัดลอกโน้ตไว้</p>
    </Section>
    <Section title="แพ็กเกจและขีดจำกัดพื้นที่">
      <p>ทุกบัญชีเริ่มต้นที่แพ็กเกจ Free ขีดจำกัดวัดจากขนาดของโน้ตหลังเข้ารหัส เพราะเซิร์ฟเวอร์ของเราเห็นได้เพียงเท่านั้น</p>
      <List>
        <li><strong>Free:</strong> โน้ตละไม่เกิน 256 KB และรวมทั้งหมดไม่เกิน 25 MB</li>
        <li><strong>Pro:</strong> โน้ตละไม่เกิน 8 MB และรวมทั้งหมดไม่เกิน 1 GB ขณะนี้ยังไม่เปิดขาย Pro เราจะเพิ่มราคาและเงื่อนไขการชำระเงินในหน้านี้ก่อนเปิดขาย</li>
      </List>
      <p>การแก้ไขที่เกินขีดจำกัดจะยังถูกบันทึกไว้บนอุปกรณ์ของคุณ และจะซิงก์เมื่อขนาดโน้ตอยู่ในขีดจำกัด เราอาจปรับขีดจำกัดได้ หากการปรับนั้นกระทบโน้ตที่คุณมีอยู่แล้ว เราจะแจ้งให้ทราบล่วงหน้า</p>
    </Section>
    <Section title="บัญชีและรหัสผ่านคลังของคุณ">
      <List>
        <li>โปรดเก็บรักษารหัสผ่านบัญชีและรหัสผ่านคลังของคุณให้ปลอดภัย คุณเป็นผู้รับผิดชอบต่อการใช้งานที่เกิดขึ้นภายใต้บัญชีของคุณ</li>
        <li>เราไม่สามารถรีเซ็ตหรือกู้คืนรหัสผ่านคลังได้ หากคุณทำหาย โน้ตของคุณจะไม่สามารถอ่านได้อีกอย่างถาวร ทั้งโดยคุณและโดยเรา</li>
        <li>โปรดเก็บสำเนาของข้อมูลสำคัญไว้เองด้วย</li>
      </List>
    </Section>
    <Section title="การใช้งานที่ยอมรับได้">
      <p>ห้ามใช้ DeezNote เพื่อ:</p>
      <List>
        <li>จัดเก็บหรือเผยแพร่สิ่งที่ผิดกฎหมายไทย หรือสิ่งที่คุณไม่มีสิทธิ์จัดเก็บ</li>
        <li>โจมตี ทำให้ระบบรับภาระเกิน หรือสำรวจช่องโหว่ของบริการ หรือหลบเลี่ยงการจำกัดอัตราการใช้งานหรือระบบความปลอดภัย</li>
        <li>เข้าถึงบัญชีหรือข้อมูลของผู้อื่น</li>
        <li>สมัครสมาชิกจำนวนมากหรือสร้างการใช้งานปริมาณสูงด้วยระบบอัตโนมัติ</li>
      </List>
    </Section>
    <Section title="เนื้อหาของคุณ">
      <p>โน้ตเป็นของคุณ และเนื่องจากถูกเข้ารหัสในเบราว์เซอร์ เราจึงอ่านไม่ได้ คุณให้สิทธิ์เราเพียงเท่าที่จำเป็นในการจัดเก็บข้อมูลที่เข้ารหัสและส่งกลับไปยังอุปกรณ์ของคุณ</p>
    </Section>
    <Section title="การระงับและการลบบัญชี">
      <p>คุณลบบัญชีของตัวเองได้ทุกเมื่อจากในแอป เราอาจระงับหรือลบบัญชีที่ฝ่าฝืนข้อกำหนดนี้ หรือที่ก่อความเสี่ยงต่อบริการ หรือเมื่อมีคำสั่งที่ชอบด้วยกฎหมาย</p>
    </Section>
    <Section title="ความรับผิด">
      <p>บริการนี้ให้บริการโดยไม่มีการรับประกันใดๆ และระบบเข้ารหัสยังไม่ผ่านการตรวจสอบโดยหน่วยงานอิสระ เท่าที่กฎหมายไทยอนุญาต เราไม่รับผิดชอบต่อการสูญหายของข้อมูล การเข้าใช้งานไม่ได้ หรือความเสียหายอื่นใดที่เกิดจากการใช้ DeezNote</p>
    </Section>
    <Section title="กฎหมายที่ใช้บังคับและการเปลี่ยนแปลง">
      <p>ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย หากมีการเปลี่ยนแปลง เราจะปรับปรุงหน้านี้และวันที่ด้านบน การใช้งาน DeezNote ต่อหลังจากนั้นถือว่าคุณยอมรับข้อกำหนดใหม่ หากมีคำถาม โปรดติดต่อผ่าน <Issues>GitHub issues</Issues></p>
    </Section>
  </>;
}
