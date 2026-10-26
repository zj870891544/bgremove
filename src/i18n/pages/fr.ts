import type { LocalePages } from "@/i18n";

const pages: LocalePages = {
  "transparent-background": {
    label: "Fond transparent",
    content: {
      slug: "transparent-background",
      keyword: "fond transparent",
      metaTitle: "Rendre un fond transparent gratuitement – Créer un PNG transparent | BGRemove",
      metaDescription:
        "Rendez le fond de n'importe quelle image transparent en quelques secondes. Transformez un JPG en PNG transparent HD gratuitement, idéal pour logos, produits et visuels. Sans inscription ni envoi de vos photos.",
      h1: "Rendre le fond transparent",
      h1Accent: "et télécharger un PNG",
      sub: "Transformez n'importe quel JPG en PNG à fond transparent automatiquement. Parfait pour les logos, photos produits, stickers et créations graphiques.",
      howTo: "Comment rendre le fond d'une image transparent",
      defaultBg: "transparent",
      intro: {
        heading: "Créez des PNG transparents à partir de n'importe quelle photo",
        paragraphs: [
          "Un fond transparent permet de poser une image sur n'importe quel support — l'en-tête d'un site, une diapositive, un t-shirt ou une autre photo — sans carré blanc. BGRemove repère le sujet et rend chaque pixel du fond transparent, avec des contours adoucis pour éviter tout halo.",
          "Le résultat est un PNG standard avec couche alpha, compatible avec Canva, Figma, PowerPoint, Google Slides, Photoshop, Word et tous les navigateurs.",
        ],
      },
      steps: [
        { title: "Importez un JPG ou un PNG", text: "Toutes les images fonctionnent, y compris les captures d'écran et les scans." },
        { title: "Le fond devient transparent", text: "Le damier indique précisément les zones transparentes." },
        { title: "Téléchargez le PNG", text: "Cliquez sur Télécharger pour enregistrer le PNG transparent en pleine résolution." },
      ],
      useCases: [
        { title: "Logos", text: "Supprimez le carré blanc autour d'un logo pour l'intégrer à des en-têtes sombres ou colorés." },
        { title: "Impression à la demande", text: "Préparez des visuels transparents pour t-shirts, mugs et autocollants." },
        { title: "Présentations", text: "Placez personnes et objets sur vos diapositives sans rectangles disgracieux." },
        { title: "Visuels web", text: "Créez bannières et icônes qui s'adaptent à toutes les couleurs de section." },
      ],
      article: [
        {
          heading: "JPG ou PNG : pourquoi la transparence exige le PNG",
          paragraphs: [
            "Le JPG n'a pas de couche alpha : il ne peut pas stocker la transparence, qui est toujours remplacée par une couleur à l'enregistrement. Le PNG et le WebP la gèrent. BGRemove enregistre les résultats transparents en PNG, le format le plus compatible.",
            "Si votre logo comporte des lettres fines ou des espaces intérieurs (comme le centre d'un « o »), importez la plus grande version disponible et utilisez le pinceau Effacer en petite taille pour nettoyer ces zones.",
          ],
        },
      ],
      faqs: [
        { q: "Comment rendre le fond d'une image transparent ?", a: "Importez l'image dans BGRemove. Le fond est supprimé automatiquement et s'affiche en damier. Cliquez sur Télécharger pour enregistrer un PNG transparent." },
        { q: "Pourquoi mon PNG transparent s'affiche-t-il sur fond blanc ?", a: "Certaines visionneuses (Photos de Windows, aperçus d'e-mails…) affichent la transparence en blanc. Ouvrez le PNG dans un logiciel de graphisme ou posez-le sur un fond coloré pour vérifier." },
      ],
      related: [],
    },
  },
  "white-background": {
    label: "Fond blanc",
    content: {
      slug: "white-background",
      keyword: "fond blanc",
      metaTitle: "Mettre un fond blanc sur une photo gratuitement – En 1 clic | BGRemove",
      metaDescription:
        "Mettez un fond blanc sur n'importe quelle photo en un clic. BGRemove supprime le fond d'origine et le remplace par du blanc pur : idéal pour Amazon, Vinted, les photos d'identité et les portraits pro.",
      h1: "Mettre un fond blanc",
      h1Accent: "sur vos produits et portraits",
      sub: "Remplacez n'importe quel fond par du blanc pur (#FFFFFF) automatiquement — le standard d'Amazon, des photos d'identité et des portraits professionnels.",
      howTo: "Comment mettre un fond blanc sur une photo",
      defaultBg: "white",
      intro: {
        heading: "Un fond blanc pur sans studio photo",
        paragraphs: [
          "Les places de marché comme Amazon exigent un fond blanc pur (RGB 255, 255, 255) pour l'image principale. L'obtenir à la prise de vue demande un éclairage et un fond de studio. BGRemove y parvient à partir d'une photo de smartphone : il supprime le fond d'origine et le remplit d'un blanc exact.",
          "Vous préférez un blanc cassé ou la couleur de votre marque ? Choisissez n'importe quelle couleur dans le panneau Arrière-plan, l'aperçu se met à jour instantanément.",
        ],
      },
      steps: [
        { title: "Importez votre photo", text: "Une photo produit, un portrait ou une photo pour un document." },
        { title: "Le blanc est appliqué", text: "Le fond est supprimé et remplacé automatiquement par du blanc pur." },
        { title: "Téléchargez en JPG ou PNG", text: "Exportez un JPG sur fond blanc prêt à publier." },
      ],
      useCases: [
        { title: "Amazon et marketplaces", text: "Respectez les règles de fond blanc pour l'image principale de vos annonces." },
        { title: "Photos d'identité", text: "Créez un fond blanc uni pour passeport, visa ou badge." },
        { title: "Portraits d'équipe", text: "Donnez un rendu propre et homogène à toutes les photos de l'équipe." },
        { title: "Catalogues", text: "Harmonisez toutes les images de votre boutique en ligne." },
      ],
      article: [
        {
          heading: "Les exigences de fond blanc d'Amazon",
          paragraphs: [
            "Amazon demande que l'image principale ait un fond blanc pur, ne montre que le produit et occupe l'essentiel du cadre. Après BGRemove, vérifiez le cadrage et exportez en JPG d'au moins 1000 px sur le plus grand côté pour activer le zoom.",
            "De nombreux pays exigent un fond blanc ou gris clair pour les photos d'identité. BGRemove fournit une base blanche nette ; respectez aussi les règles de format, de position de la tête et d'éclairage.",
          ],
        },
      ],
      faqs: [
        { q: "Comment passer le fond d'une photo en blanc ?", a: "Importez la photo sur cette page. BGRemove supprime le fond et applique du blanc pur automatiquement. Cliquez sur Télécharger pour l'enregistrer en JPG ou PNG." },
        { q: "Le blanc est-il exactement #FFFFFF ?", a: "Oui. Le blanc par défaut est RGB 255, 255, 255. Vous pouvez choisir n'importe quelle autre couleur avec le sélecteur." },
      ],
      related: [],
    },
  },
  "change-background-color": {
    label: "Changer la couleur de fond",
    content: {
      slug: "change-background-color",
      keyword: "changer couleur de fond",
      metaTitle: "Changer la couleur de fond d'une photo gratuitement – En 1 clic | BGRemove",
      metaDescription:
        "Changez la couleur de fond de n'importe quelle photo en ligne et gratuitement. BGRemove supprime le fond par IA et vous laisse choisir blanc, noir, bleu, rouge, toute couleur, un flou ou une nouvelle photo.",
      h1: "Changer la couleur de fond",
      h1Accent: "de n'importe quelle photo",
      sub: "Supprimez le fond et choisissez-en un nouveau : blanc, noir, bleu, rouge, pastel, la couleur de votre marque, un flou ou une photo.",
      howTo: "Comment changer la couleur de fond d'une photo",
      intro: {
        heading: "Changez la couleur de fond en quelques secondes",
        paragraphs: [
          "Changer le fond d'une photo demandait autrefois des masques dans Photoshop. Avec BGRemove, l'IA supprime l'ancien fond automatiquement et l'éditeur vous laisse choisir une nouvelle couleur d'un simple clic. L'aperçu est instantané : testez dix couleurs en dix secondes.",
          "En plus des couleurs unies, vous pouvez utiliser des dégradés, flouter le fond d'origine ou importer votre propre image de fond.",
        ],
      },
      steps: [
        { title: "Importez votre photo", text: "Le fond est supprimé automatiquement." },
        { title: "Choisissez une couleur", text: "Touchez une pastille ou choisissez n'importe quelle couleur avec le sélecteur." },
        { title: "Téléchargez", text: "Enregistrez la photo avec son nouveau fond en JPG, PNG ou WebP." },
      ],
      useCases: [
        { title: "Identité de marque", text: "Placez toutes les photos d'équipe ou de produits sur la couleur exacte de votre marque." },
        { title: "Réseaux sociaux", text: "Les fonds unis et vifs font ressortir le sujet dans le fil d'actualité." },
        { title: "Photos de documents", text: "Passez au fond blanc, bleu ou rouge demandé par un dossier." },
        { title: "Tests e-commerce", text: "Testez quelle couleur de fond convertit le mieux pour vos annonces." },
      ],
      article: [
        {
          heading: "Bien choisir la couleur de fond",
          paragraphs: [
            "Le blanc est net et neutre ; le noir évoque le haut de gamme ; les couleurs saturées attirent l'œil sur les réseaux ; les pastels paraissent chaleureux. Choisissez une couleur qui contraste avec les tons dominants du sujet pour garder des contours nets.",
            "Les fonds bleus sont courants pour certains documents officiels, les fonds rouges pour certains visas et photos scolaires, et le blanc pour les passeports et les marketplaces. BGRemove les propose en un clic.",
          ],
        },
      ],
      faqs: [
        { q: "Comment changer gratuitement la couleur de fond d'une photo ?", a: "Importez la photo ici, attendez la suppression du fond, choisissez une couleur dans le panneau Arrière-plan et téléchargez le résultat." },
        { q: "Puis-je utiliser ma propre image de fond ?", a: "Oui. Dans le panneau Arrière-plan, rubrique Photos, cliquez sur Importer et choisissez une image. Votre sujet est placé par-dessus automatiquement." },
      ],
      related: [],
    },
  },
};

export default pages;
