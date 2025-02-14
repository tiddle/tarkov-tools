/* eslint-disable no-restricted-globals */
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
    useParams,
    useHistory,
} from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import Icon from '@mdi/react';
import { mdiLock } from '@mdi/js';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css'; // optional

import Graph from '../../components/Graph.jsx';
import useKeyPress from '../../hooks/useKeyPress';
import DataTable from '../../components/data-table';
import CenterCell from '../../components/center-cell';
import ValueCell from '../../components/value-cell';
import { selectAllItems, fetchItems } from '../../features/items/itemsSlice';
import formatPrice from '../../modules/format-price';
import capitalizeTheFirstLetterOfEachWord from '../../modules/capitalize-first';
import getRublePrice from '../../modules/get-ruble-price.js';

import rawData from '../../data/ammo.json';
import './index.css';

const MAX_DAMAGE = 170;
const MAX_PENETRATION = 70;

const formattedData = rawData.data.map((ammoData) => {
    const returnData = {
        ...ammoData,
        displayDamage: ammoData.damage,
        displayPenetration: ammoData.penetration,
    };

    if(ammoData.damage > MAX_DAMAGE){
        returnData.name = `${ammoData.name} (${ammoData.damage})`;
        returnData.displayDamage = MAX_DAMAGE;
    }

    if(ammoData.penetration > MAX_PENETRATION){
        returnData.name = `${ammoData.name} (${ammoData.penetration})`;
        returnData.displayPenetration = MAX_PENETRATION;
    }

    return returnData;
})
.sort((a, b) => {
    return a.type.localeCompare(b.type);
});

let typeCache = [];
const legendData = formattedData.map((ammo) => {
    if (typeCache.includes(ammo.type)){
        return false;
    }

    typeCache.push(ammo.type);

    return {
        ...ammo,
        name: ammo.type,
        symbol: ammo.symbol,
    }
}).filter(Boolean);

function Ammo() {
    const {currentAmmo} = useParams();
    let currentAmmoList = [];
    if(currentAmmo){
        currentAmmoList = currentAmmo.split(',');
    }
    const history = useHistory();
    const [selectedLegendName, setSelectedLegendName] = useState(currentAmmoList);
    const shiftPress = useKeyPress('Shift');
    const { t } = useTranslation();
    const dispatch = useDispatch();
    const items = useSelector(selectAllItems);
    const itemStatus = useSelector((state) => {
        return state.items.status;
    });

    useEffect(() => {
        let timer = false;
        if (itemStatus === 'idle') {
            dispatch(fetchItems());
        }

        if(!timer){
            timer = setInterval(() => {
                dispatch(fetchItems());
            }, 600000);
        }

        return () => {
            clearInterval(timer);
        }
    }, [itemStatus, dispatch]);

    useEffect(() => {
        if(currentAmmo === []){
            setSelectedLegendName([]);

            return true;
        }

        if(currentAmmo){
            setSelectedLegendName(currentAmmo.split(','));
        } else {
            setSelectedLegendName([]);
        }
    }, [currentAmmo]);

    const listState = useMemo(() => {
        const returnData = formattedData.filter(ammo =>
            !selectedLegendName || selectedLegendName.length === 0 || selectedLegendName.includes(ammo.type)
        ).map((ammo) => {
            ammo.name = ammo.shortName;
            ammo = {
                ...ammo,
                ...items.find(item => ammo.id === item.id),
            };

            ammo.trader = ammo.buyFor?.map((buyFor) => {
                if(buyFor.source === 'flea-market'){
                    return false;
                }

                return buyFor;
            })
            .filter(Boolean)[0];

            if(!shiftPress){
                return ammo;
            }

            return {
                ...ammo,
                name: `${ammo.name} (${ammo.fragChance})`,
            };
        });

        return returnData;
    }, [selectedLegendName, shiftPress, items]);

    const handleLegendClick = useCallback((event, { datum: { name } }) => {
        let newSelectedAmmo = [...selectedLegendName];
        const metaKey = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

        if(newSelectedAmmo.includes(name) && metaKey){
            newSelectedAmmo.splice(newSelectedAmmo.indexOf(name), 1);
        } else if(newSelectedAmmo.includes(name)){
            newSelectedAmmo = [];
        } else if(metaKey){
            newSelectedAmmo.push(name);
        } else {
            newSelectedAmmo = [name];
        }

        setSelectedLegendName(newSelectedAmmo);
        history.push(`/ammo/${newSelectedAmmo.join(',')}`);

    }, [selectedLegendName, setSelectedLegendName, history]);

    const traderPriceSort = useMemo(() => (a, b) => {
        if(!a.original.trader){
            return 1;
        }

        if(!b.original.trader){
            return -1;
        }

        if(getRublePrice(a.original.trader?.price, a.original.trader?.currency) > getRublePrice(b.original.trader?.price, b.original.trader?.currency)){
            return 1;
        }

        if(getRublePrice(a.original.trader?.price, a.original.trader?.currency) < getRublePrice(b.original.trader?.price, b.original.trader?.currency)){
            return -1;
        }

        return 0;
    }, []);

    const columns = useMemo(
        () => [
            {
                Header: t(''),
                accessor: 'gridImageLink',
                Cell: (props) => {
                    return <CenterCell>
                        <img
                            alt = {`${props.row.original.name} icon`}
                            src = {props.value}
                        />
                    </CenterCell>;
                },
            },
            {
                Header: t('Name'),
                accessor: 'name',
            },
            {
                Header: t('Caliber'),
                accessor: 'type',
                Cell: CenterCell,
            },
            {
                Header: t('Damage'),
                accessor: 'damage',
                Cell: CenterCell,
            },
            {
                Header: t('Penetration'),
                accessor: 'penetration',
                Cell: CenterCell,
            },
            {
                Header: t('Price'),
                accessor: 'lastLowPrice',
                Cell: ValueCell,
            },
            {
                Header: t('Trader price'),
                accessor: 'trader',
                sortType: traderPriceSort,
                Cell: ({value}) => {
                    if(!value){
                        return null;
                    }

                    let printString = `${formatPrice(value.price, value.currency)}`;
                    let questLocked = false;
                    let loyaltyString = '';

                    for(const requirement of value.requirements){
                        if(requirement.type === 'loyaltyLevel'){
                            loyaltyString = `LL${requirement.value}`;
                        }

                        if(requirement.type === 'questCompleted'){
                            questLocked = true;
                        }
                    }

                    if(questLocked) {
                        printString = <div >
                            {printString}
                            <Tippy
                                content = {'Locked behind a quest'}
                            >
                                <div
                                    className = 'trader-unlock-wrapper'
                                >
                                    <Icon
                                        path={mdiLock}
                                        size={1}
                                        className = 'icon-with-text'
                                    />
                                    {`${capitalizeTheFirstLetterOfEachWord(value.source)} ${loyaltyString}`}
                                </div>
                            </Tippy>
                        </div>;
                    } else {
                        printString = <div>
                            {printString}
                            <div
                                className = 'trader-unlock-wrapper'
                            >
                                {`${capitalizeTheFirstLetterOfEachWord(value.source)} ${loyaltyString}`}
                            </div>
                        </div>;
                    }

                    return <CenterCell>
                        {printString}
                    </CenterCell>;
                },
            },
        ],
        [t, traderPriceSort]
    );

    return [
        <div
            className = {'updated-label'}
            key = {'ammo-updated-label'}
        >
            {`Ammo updated: ${new Date(rawData.updated).toLocaleDateString()}`}
        </div>,
        <Graph
            key = 'ammo-graph'
            listState = {listState}
            legendData = {legendData}
            selectedLegendName = {selectedLegendName}
            handleLegendClick = {handleLegendClick}
            xMax = {MAX_DAMAGE}
            yMax = {MAX_PENETRATION}
        />,
        <DataTable
            columns = {columns}
            key = 'ammo-table'
            data = {listState}
        />
    ];
}

export default Ammo;
