param([string]$SiteUrl='https://blogssite.sharepoint.com/sites/Bibliotheque')
Connect-PnPOnline -Url $SiteUrl -DeviceLogin
$list='Pays'
if(-not (Get-PnPList -Identity $list -ErrorAction SilentlyContinue)){New-PnPList -Title $list -Template GenericList | Out-Null}
$countries=@(
@{Code='FR';Nom='France';Continent='Europe'},
@{Code='BE';Nom='Belgique';Continent='Europe'},
@{Code='LU';Nom='Luxembourg';Continent='Europe'},
@{Code='DE';Nom='Allemagne';Continent='Europe'},
@{Code='CH';Nom='Suisse';Continent='Europe'},
@{Code='IT';Nom='Italie';Continent='Europe'},
@{Code='ES';Nom='Espagne';Continent='Europe'},
@{Code='PT';Nom='Portugal';Continent='Europe'},
@{Code='GB';Nom='Royaume-Uni';Continent='Europe'},
@{Code='IE';Nom='Irlande';Continent='Europe'},
@{Code='NL';Nom='Pays-Bas';Continent='Europe'},
@{Code='US';Nom='États-Unis';Continent='Amérique du Nord'},
@{Code='CA';Nom='Canada';Continent='Amérique du Nord'},
@{Code='MX';Nom='Mexique';Continent='Amérique du Nord'},
@{Code='BR';Nom='Brésil';Continent='Amérique du Sud'},
@{Code='AR';Nom='Argentine';Continent='Amérique du Sud'},
@{Code='MA';Nom='Maroc';Continent='Afrique'},
@{Code='DZ';Nom='Algérie';Continent='Afrique'},
@{Code='TN';Nom='Tunisie';Continent='Afrique'},
@{Code='CN';Nom='Chine';Continent='Asie'},
@{Code='JP';Nom='Japon';Continent='Asie'},
@{Code='IN';Nom='Inde';Continent='Asie'},
@{Code='AU';Nom='Australie';Continent='Océanie'},
@{Code='NZ';Nom='Nouvelle-Zélande';Continent='Océanie'}
)
foreach($c in $countries){
Add-PnPListItem -List $list -Values @{Title=$c.Nom;CodePays=$c.Code;NomPays=$c.Nom;Continent=$c.Continent} | Out-Null
}
Write-Host 'Import terminé.'
