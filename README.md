# Planer diety

Aplikacja do planowania posiłków (kalendarz + lista zakupów) zbudowana w React + Vite.
Baza: 280 przepisów wczytanych z pliku `Baza_posilkow_z_kategoriami.xlsx`.

## Uruchomienie lokalne (VS Code)

Wymagany Node.js 18+ (https://nodejs.org).

```bash
npm install    # jednorazowo, instaluje zależności
npm run dev    # start — aplikacja pod http://localhost:5173
```

Zmiany w kodzie odświeżają się w przeglądarce automatycznie.

## Struktura projektu

```
src/
  App.jsx               <- cała logika i wygląd aplikacji
  main.jsx              <- punkt startowy (montuje App, rejestruje PWA)
  data/
    recipes.js          <- baza przepisów (wygenerowana z Excela, arkusz Posiłki)
    categories.js       <- kategorie zakupowe (wygenerowane z Excela, arkusz Kategorie)
public/
  manifest.webmanifest  <- konfiguracja PWA (nazwa, ikony, kolory)
  sw.js                 <- service worker: działanie offline
  icon.svg / icon-*.png <- ikony aplikacji
```

## Aktualizacja bazy przepisów

Źródłem prawdy jest Excel. Po zmianach w nim (nowe przepisy, kategorie, linki do zdjęć
w kolumnie `Zdjęcie_URL`) trzeba przegenerować pliki `src/data/*.js` — najprościej:
wgraj Excela do Claude i poproś o wygenerowanie nowych `recipes.js` i `categories.js`,
potem podmień pliki. Format rekordu w `recipes.js`:

```js
{ id, diet, day, cat, name, kcal, p, f, c, port, ing: [{ n, d, g }], note, img }
```

`img` to opcjonalny link do zdjęcia — jeśli jest, wyświetla się w widoku przepisu.

## Zapis planu

Plan zapisuje się w `localStorage` przeglądarki (klucz `diet-plan-v1`) — osobno na
każdym urządzeniu/przeglądarce. Wyczyszczenie danych strony kasuje plan.

## Publikacja w internecie

```bash
npm run build   # tworzy gotową wersję w folderze dist/
```

Najprościej — **Netlify Drop**: wejdź na https://app.netlify.com/drop i przeciągnij
folder `dist/` na stronę. Dostajesz publiczny link od razu.

Alternatywnie **Vercel**: wrzuć projekt na GitHub, na https://vercel.com kliknij
"Import project" i wskaż repozytorium — Vercel sam wykryje Vite i będzie publikował
każdą zmianę automatycznie.

## Instalacja na telefonie (PWA)

Po opublikowaniu otwórz adres strony na telefonie:
- **Android/Chrome**: pojawi się propozycja "Zainstaluj aplikację" (albo menu ⋮ -> Dodaj do ekranu głównego)
- **iPhone/Safari**: przycisk Udostępnij -> "Dodaj do ekranu początkowego"

Aplikacja dostaje własną ikonę, działa na pełnym ekranie i offline.
