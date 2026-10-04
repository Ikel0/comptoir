# Définitions des indicateurs

Chaque indicateur indique son grain, sa formule, le modèle dbt qui le porte et le piège qu'il évite. Montants en réals (BRL), délais en jours calendaires.

## Commande livrée

Commande au statut `delivered` avec une date de livraison client renseignée (96 470 commandes). Les 8 commandes `delivered` sans date de livraison sont exclues des indicateurs de délai.

Modèle : `fct_orders` (`order_status = 'delivered' and delivered_at is not null`).

## Délai annoncé (`promised_days`)

Jours entre la date d'achat et la date de livraison estimée affichée au client.

Grain : commande. Modèle : `int_orders`.

Piège : Olist ne fournit qu'une date estimée, sans heure. Comparer à l'heure près (`delivered_at > estimated_delivery_date`) classe en retard toute commande livrée le jour prévu après minuit. Les comparaisons se font donc entre dates.

## Délai réel (`actual_days`)

Jours entre la date d'achat et la date de livraison au client.

## Commande en retard (`is_late`) et taux de retard

Commande livrée à une date postérieure à la date estimée. Taux de retard = commandes en retard / commandes livrées.

## Mauvais avis

Avis noté 1 ou 2 sur 5. Taux de mauvais avis = mauvais avis / commandes livrées ayant un avis.

Piège : 547 commandes ont plusieurs avis et 789 `review_id` couvrent plusieurs commandes. `stg_order_reviews` garde, pour chaque commande, l'avis répondu le plus récemment. Compter les lignes de la table brute surestime le nombre d'avis.

## Avis déposé avant la livraison (`reviewed_before_delivery`)

Avis dont la date de création précède la date de livraison. Olist envoie le questionnaire à la date estimée ; si le colis est en retard, le client répond avant de l'avoir reçu.

## Client

Une personne est identifiée par `customer_unique_id`.

Piège : `customer_id` change à chaque commande (99 441 `customer_id` pour 99 441 commandes). Un taux de réachat calculé sur `customer_id` vaut 0 %.

## Taux de réachat à 180 jours

Part des clients éligibles qui passent une deuxième commande livrée dans les 180 jours suivant leur première commande livrée.

Grain : client. Modèle : `mart_first_orders` (`is_eligible`, `returned_in_window`).

Éligible : première commande passée au plus tard 180 jours avant le 29 août 2018, date du dernier achat livré de l'archive (variables dbt `data_end_date` et `repeat_window_days`).

Piège : sans ce filtre, les clients arrivés en 2018 n'ont pas eu le temps de revenir et font baisser le taux. Un taux « sur toute la période » mélange des clients observés deux ans et d'autres observés deux semaines.

## Effet du retard sur le réachat, ajusté par État

Taux de réachat des clients dont la première commande était en retard, comparé au taux des clients livrés à l'heure, standardisé sur la répartition par État des premiers. Le score z rapporte l'écart à l'écart-type binomial.

Piège : les retards se concentrent dans certains États (Maranhão, Ceará, Bahia, Rio), qui ont aussi leurs propres habitudes d'achat. La comparaison brute attribue au retard un effet qui vient en partie de la géographie.

## Trajet

Couple État du vendeur, État du client. Seules les commandes à un seul vendeur sont attribuées à un trajet (98,7 % des commandes) ; les trajets de moins de 30 commandes ne sont pas publiés.

Modèle : `mart_delivery_promise`.

## Remise tardive du vendeur

Commande remise au transporteur après la date limite d'expédition fixée au vendeur (`shipping_limit_date`, maximum sur les articles de la commande).

Piège : 166 commandes sont remises au transporteur avant l'achat et 23 livrées avant d'être expédiées. Elles sont exclues de la décomposition vendeur / transporteur.

## Retard excédentaire d'un vendeur

Retards observés du vendeur moins retards attendus, l'attendu étant la somme, sur ses commandes, du taux de retard de chaque trajet. Un vendeur est signalé s'il a au moins 30 commandes, plus de 1,5 fois les retards attendus et au moins 5 retards excédentaires.

## Mois partiel

Mois de moins de 400 commandes (`mart_monthly.is_partial`) : septembre, octobre et décembre 2016, septembre et octobre 2018. À exclure des séries temporelles.
