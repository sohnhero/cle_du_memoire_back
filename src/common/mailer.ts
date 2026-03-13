import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'contact@cledumemoire.com';
const ADMIN_EMAIL = 'admin@cledumemoire.com'; // TODO: Update with real admin email

const LOGO_URL = 'https://www.cledumemoire.com/logo.png';
const APP_URL = 'https://www.cledumemoire.com/login';
const PRIMARY_COLOR = '#0F172A'; // Dark blue/slate
const ACCENT_COLOR = '#F9B700';  // Yellow

const baseTemplate = (title: string, content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #334155; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .header { background-color: ${PRIMARY_COLOR}; padding: 30px 40px; text-align: center; }
    .header img { max-height: 50px; }
    .content { padding: 40px; line-height: 1.6; }
    h1 { color: ${PRIMARY_COLOR}; font-size: 24px; margin-top: 0; margin-bottom: 24px; font-weight: 700; }
    p { margin-bottom: 16px; font-size: 16px; }
    .button { display: inline-block; background-color: ${ACCENT_COLOR}; color: ${PRIMARY_COLOR}; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin-top: 10px; margin-bottom: 10px; }
    .footer { background-color: #f1f5f9; padding: 24px 40px; text-align: center; font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .details-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .details-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .details-row:last-child { margin-bottom: 0; }
    .details-label { font-weight: 600; color: #475569; }
    .details-value { color: ${PRIMARY_COLOR}; font-weight: bold; }
    center { text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${LOGO_URL}" alt="Clé du Mémoire Logo">
    </div>
    <div class="content">
      <h1>${title}</h1>
      ${content}
    </div>
    <div class="footer">
      Clé du Mémoire &copy; ${new Date().getFullYear()}<br>
      Plateforme d'accompagnement académique premium au Sénégal.
    </div>
  </div>
</body>
</html>
`;

export const sendWelcomeEmail = async (user: any) => {
  const content = `
    <p>Bonjour <strong>${user.firstName || 'Étudiant'}</strong>,</p>
    <p>Bienvenue sur <strong>Clé du Mémoire</strong> ! Nous sommes ravis de vous compter parmi nos étudiants.</p>
    <p>Notre plateforme est conçue pour vous accompagner étape par étape dans la rédaction de votre mémoire ou thèse avec l'aide d'experts dédiés.</p>
    <p>Pour commencer, veuillez vous connecter à votre espace personnel et découvrir nos différents packs d'accompagnement :</p>
    <center><a href="${APP_URL}" class="button">Accéder à mon espace</a></center>
    <p>Si vous avez la moindre question, n'hésitez pas à nous répondre directement à cet email.</p>
    <p>Cordialement,<br>L'équipe Clé du Mémoire</p>
  `;

  try {
    await resend.emails.send({
      from: `Clé du Mémoire <${FROM_EMAIL}>`,
      to: user.email,
      subject: 'Bienvenue sur Clé du Mémoire ! 🎉',
      html: baseTemplate('Bienvenue sur Clé du Mémoire', content),
    });
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
};

export const sendNewUserNotificationToAdmin = async (user: any) => {
  const content = `
    <p>Un nouvel étudiant vient de s'inscrire sur la plateforme.</p>
    <div class="details-box">
      <div class="details-row"><span class="details-label">Nom :</span> <span class="details-value">${user.firstName || ''} ${user.lastName || ''}</span></div>
      <div class="details-row"><span class="details-label">Email :</span> <span class="details-value">${user.email}</span></div>
      <div class="details-row"><span class="details-label">Date d'inscription :</span> <span class="details-value">${new Date().toLocaleString('fr-FR')}</span></div>
    </div>
    <center><a href="https://www.cledumemoire.com/admin/users" class="button">Voir dans l'admin</a></center>
  `;

  try {
    await resend.emails.send({
      from: `Système <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: 'Nouvelle Inscription Étudiant 👤',
      html: baseTemplate('Nouvelle inscription', content),
    });
  } catch (error) {
    console.error('Failed to send admin notification:', error);
  }
};

export const sendPaymentReceivedEmail = async (user: any, amount: number, method: string, reference: string) => {
  const content = `
    <p>Bonjour <strong>${user.firstName || 'Étudiant'}</strong>,</p>
    <p>Nous avons bien reçu votre notification de paiement. Nous vous en remercions !</p>
    <p>Voici le récapitulatif de votre transaction :</p>
    <div class="details-box">
      <div class="details-row"><span class="details-label">Montant renseigné :</span> <span class="details-value">${amount} CFA</span></div>
      <div class="details-row"><span class="details-label">Méthode :</span> <span class="details-value">${method}</span></div>
      <div class="details-row"><span class="details-label">Référence :</span> <span class="details-value">${reference}</span></div>
    </div>
    <p>Notre équipe va procéder à la vérification de ce paiement dans les plus brefs délais. Vous recevrez un nouvel e-mail dès que votre accès aura été validé et activé.</p>
    <p>Merci de votre confiance.</p>
  `;

  try {
    await resend.emails.send({
      from: `Clé du Mémoire <${FROM_EMAIL}>`,
      to: user.email,
      subject: 'Notification de paiement reçue 💸',
      html: baseTemplate('Paiement en cours de validation', content),
    });
  } catch (error) {
    console.error('Failed to send payment received email:', error);
  }
};

export const sendPaymentNotificationToAdmin = async (user: any, amount: number, method: string, reference: string, packName: string) => {
  const content = `
    <p>L'étudiant <strong>${user.firstName || ''} ${user.lastName || ''}</strong> a soumis une nouvelle référence de paiement pour le pack <strong>${packName}</strong>.</p>
    <div class="details-box">
      <div class="details-row"><span class="details-label">Étudiant :</span> <span class="details-value">${user.firstName || ''} ${user.lastName || ''} (${user.email})</span></div>
      <div class="details-row"><span class="details-label">Montant :</span> <span class="details-value">${amount} CFA</span></div>
      <div class="details-row"><span class="details-label">Méthode :</span> <span class="details-value">${method}</span></div>
      <div class="details-row"><span class="details-label">Référence :</span> <span class="details-value">${reference}</span></div>
    </div>
    <p>Veuillez vérifier cette transaction dans votre tableau de bord et valider le paiement pour activer l'abonnement.</p>
    <center><a href="https://www.cledumemoire.com/admin/subscriptions" class="button">Valider le paiement</a></center>
  `;

  try {
    await resend.emails.send({
      from: `Système <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: 'Nouveau Paiement à Valider 🚨',
      html: baseTemplate('Paiement en attente', content),
    });
  } catch (error) {
    console.error('Failed to send payment notification to admin:', error);
  }
};

export const sendPaymentValidatedEmail = async (user: any, amount: number, packName: string, status: string) => {
  let statusMessage = '';
  if (status === 'ACTIVE') {
    statusMessage = "Votre Pack est désormais <strong>totalement activé</strong> ! Vous pouvez accéder à tous vos services dès maintenant.";
  } else if (status === 'PARTIAL') {
    statusMessage = "Votre paiement a été validé comme <strong>première tranche</strong>. L'accès aux services associés est ouvert.";
  }

  const content = `
    <p>Félicitations <strong>${user.firstName || 'Étudiant'}</strong> ! 🎉</p>
    <p>Nous avons le plaisir de vous informer que votre abonnement au Pack <strong>${packName}</strong> a bien été validé par notre équipe.</p>
    <div class="details-box">
      <p style="margin-bottom: 0;">${statusMessage}</p>
    </div>
    <center><a href="${APP_URL}" class="button">Accéder à mon espace</a></center>
    <p>Si vous avez des questions ou souhaitez planifier votre première séance, contactez votre conseiller via l'espace messagerie.</p>
  `;

  try {
    await resend.emails.send({
      from: `Clé du Mémoire <${FROM_EMAIL}>`,
      to: user.email,
      subject: 'Paiement Validé - Accès Activé ✅',
      html: baseTemplate('Paiement Validé', content),
    });
  } catch (error) {
    console.error('Failed to send payment validated email:', error);
  }
};

export const sendResetPasswordEmail = async (user: any, resetLink: string) => {
  const content = `
    <p>Bonjour <strong>${user.firstName || 'Étudiant'}</strong>,</p>
    <p>Vous avez demandé la réinitialisation de votre mot de passe sur <strong>Clé du Mémoire</strong>.</p>
    <p>Pour définir un nouveau mot de passe, veuillez cliquer sur le bouton ci-dessous (ce lien est valable pendant 1 heure) :</p>
    <center><a href="${resetLink}" class="button">Réinitialiser mon mot de passe</a></center>
    <p>Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet e-mail. Votre mot de passe restera inchangé.</p>
    <p>Cordialement,<br>L'équipe Clé du Mémoire</p>
  `;

  try {
    await resend.emails.send({
      from: `Sécurité <${FROM_EMAIL}>`,
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe 🔒',
      html: baseTemplate('Réinitialisation de mot de passe', content),
    });
  } catch (error) {
    console.error('Failed to send reset password email:', error);
  }
};
