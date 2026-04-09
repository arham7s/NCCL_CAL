from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Tuple

from broker_catalog import CONTRACT_MAP, PRODUCT_MULTIPLIERS, SCENARIO_TEMPLATES


def _money(value: float) -> float:
    return round(value, 2)


def _side_multiplier(side: str) -> int:
    text = side.strip().upper()
    if text in {"BUY", "LONG"}:
        return 1
    if text in {"SELL", "SHORT"}:
        return -1
    raise ValueError(f"Unsupported side {side!r}. Use BUY or SELL.")


def _build_scenarios(contract: Dict[str, Any], signed_quantity: float) -> List[float]:
    base_template = SCENARIO_TEMPLATES[contract["scenarioTemplate"]]
    if contract["instrumentType"] == "OPTION" and contract["optionType"] == "PUT":
        base_template = SCENARIO_TEMPLATES["long_put"]
    elif contract["instrumentType"] == "OPTION" and contract["optionType"] == "CALL":
        base_template = SCENARIO_TEMPLATES["long_call"]
    return [_money(value * contract["spanPerLot"] * signed_quantity) for value in base_template]


def _calc_cash_position(
    contract: Dict[str, Any],
    quantity: float,
    price: float,
    side: str,
    product_type: str,
) -> Dict[str, Any]:
    multiplier = PRODUCT_MULTIPLIERS[product_type]
    signed_quantity = quantity * _side_multiplier(side)
    notional = abs(quantity * price * contract["lotSize"])
    var_margin = notional * contract["varPct"] / 100.0
    elm_margin = notional * contract["elmPct"] / 100.0
    adhoc_margin = notional * contract["adhocPct"] / 100.0
    requirement = (var_margin + elm_margin + adhoc_margin) * multiplier
    return {
        "kind": "cash",
        "contractId": contract["id"],
        "exchange": contract["exchange"],
        "clearingCorp": contract["clearingCorp"],
        "symbol": contract["symbol"],
        "displayName": contract["displayName"],
        "groupKey": f"{contract['exchange']}:{contract['symbol']}:cash",
        "underlying": contract["underlying"],
        "side": side,
        "productType": product_type,
        "quantity": quantity,
        "unitLabel": contract["unitLabel"],
        "price": price,
        "signedQuantity": signed_quantity,
        "notional": _money(notional),
        "varMargin": _money(var_margin * multiplier),
        "elmMargin": _money(elm_margin * multiplier),
        "adhocMargin": _money(adhoc_margin * multiplier),
        "requirement": _money(requirement),
        "spanGross": 0.0,
        "scenarioPnl": [],
        "premiumPayable": 0.0,
        "premiumReceivable": 0.0,
        "shortOptionFloor": 0.0,
        "chargesTotal": _money(requirement),
    }


def _calc_span_position(
    contract: Dict[str, Any],
    quantity: float,
    price: float,
    side: str,
    product_type: str,
) -> Dict[str, Any]:
    multiplier = PRODUCT_MULTIPLIERS[product_type]
    side_sign = _side_multiplier(side)
    effective_quantity = quantity * multiplier
    signed_quantity = effective_quantity * side_sign
    notional = abs(quantity * contract["lotSize"] * price)
    scenarios = _build_scenarios(contract, signed_quantity)
    span_gross = max(0.0, -min(scenarios))
    exposure = notional * contract["exposurePct"] / 100.0 * multiplier
    additional = notional * contract["additionalPct"] / 100.0 * multiplier
    delivery = notional * contract["deliveryPct"] / 100.0 * multiplier

    premium_payable = 0.0
    premium_receivable = 0.0
    short_floor = 0.0
    if contract["instrumentType"] == "OPTION":
        premium_value = quantity * contract["lotSize"] * price
        if side_sign > 0:
            premium_payable = premium_value
        else:
            premium_receivable = premium_value
            short_floor = contract["shortOptionMinPerLot"] * quantity * multiplier

    return {
        "kind": "derivative",
        "contractId": contract["id"],
        "exchange": contract["exchange"],
        "clearingCorp": contract["clearingCorp"],
        "symbol": contract["symbol"],
        "displayName": contract["displayName"],
        "groupKey": f"{contract['exchange']}:{contract['underlying']}",
        "underlying": contract["underlying"],
        "side": side,
        "productType": product_type,
        "quantity": quantity,
        "unitLabel": contract["unitLabel"],
        "price": price,
        "signedQuantity": _money(signed_quantity),
        "notional": _money(notional),
        "spanGross": _money(span_gross),
        "scenarioPnl": scenarios,
        "exposureMargin": _money(exposure),
        "additionalMargin": _money(additional),
        "deliveryMargin": _money(delivery),
        "premiumPayable": _money(premium_payable),
        "premiumReceivable": _money(premium_receivable),
        "shortOptionFloor": _money(short_floor),
        "chargesTotal": _money(exposure + additional + delivery),
    }


def _parse_position(payload: Dict[str, Any]) -> Dict[str, Any]:
    contract_id = str(payload.get("contractId", "")).strip()
    if contract_id not in CONTRACT_MAP:
        raise ValueError(f"Unknown contractId {contract_id!r}.")
    contract = CONTRACT_MAP[contract_id]
    product_type = str(payload.get("productType", "")).strip().upper()
    if product_type not in PRODUCT_MULTIPLIERS:
        raise ValueError(f"Unsupported product type {product_type!r}.")
    if product_type not in contract["productTypes"]:
        raise ValueError(
            f"{product_type} is not supported for {contract['displayName']}."
        )
    quantity = float(payload.get("quantity", 0))
    price = float(payload.get("price") or contract["lastPrice"])
    if quantity <= 0:
        raise ValueError(f"Quantity must be greater than zero for {contract['displayName']}.")
    if price <= 0:
        raise ValueError(f"Price must be greater than zero for {contract['displayName']}.")
    side = str(payload.get("side", "BUY")).strip().upper()
    if contract["riskStyle"] == "VAR_ELM":
        return _calc_cash_position(contract, quantity, price, side, product_type)
    return _calc_span_position(contract, quantity, price, side, product_type)


def calculate_portfolio(payload: Dict[str, Any]) -> Dict[str, Any]:
    raw_positions = payload.get("positions") or []
    if not raw_positions:
        raise ValueError("Add at least one position to estimate margin.")

    positions = [_parse_position(item) for item in raw_positions]

    derivative_groups: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {
            "exchange": "",
            "underlying": "",
            "positions": [],
            "scenarioPnl": [0.0] * 16,
            "grossSpan": 0.0,
            "netSpan": 0.0,
            "exposureMargin": 0.0,
            "additionalMargin": 0.0,
            "deliveryMargin": 0.0,
            "shortOptionFloor": 0.0,
            "premiumPayable": 0.0,
            "premiumReceivable": 0.0,
            "requirement": 0.0,
        }
    )
    cash_rows: List[Dict[str, Any]] = []

    for position in positions:
        if position["kind"] == "cash":
            cash_rows.append(position)
            continue
        group = derivative_groups[position["groupKey"]]
        group["exchange"] = position["exchange"]
        group["underlying"] = position["underlying"]
        group["positions"].append(position)
        group["grossSpan"] += position["spanGross"]
        group["exposureMargin"] += position["exposureMargin"]
        group["additionalMargin"] += position["additionalMargin"]
        group["deliveryMargin"] += position["deliveryMargin"]
        group["shortOptionFloor"] += position["shortOptionFloor"]
        group["premiumPayable"] += position["premiumPayable"]
        group["premiumReceivable"] += position["premiumReceivable"]
        for index, value in enumerate(position["scenarioPnl"]):
            group["scenarioPnl"][index] += value

    derivative_breakdown: List[Dict[str, Any]] = []
    gross_span_total = 0.0
    net_span_total = 0.0
    charges_total = 0.0
    premium_payable_total = 0.0
    premium_receivable_total = 0.0
    derivative_requirement_total = 0.0

    for group_key in sorted(derivative_groups):
        group = derivative_groups[group_key]
        net_span = max(0.0, -min(group["scenarioPnl"]))
        base_requirement = (
            net_span
            + group["exposureMargin"]
            + group["additionalMargin"]
            + group["deliveryMargin"]
        )
        requirement = max(base_requirement, group["shortOptionFloor"])
        group["netSpan"] = _money(net_span)
        group["requirement"] = _money(requirement)
        derivative_breakdown.append(
            {
                "groupKey": group_key,
                "exchange": group["exchange"],
                "underlying": group["underlying"],
                "positions": group["positions"],
                "scenarioPnl": [_money(value) for value in group["scenarioPnl"]],
                "grossSpan": _money(group["grossSpan"]),
                "netSpan": _money(group["netSpan"]),
                "exposureMargin": _money(group["exposureMargin"]),
                "additionalMargin": _money(group["additionalMargin"]),
                "deliveryMargin": _money(group["deliveryMargin"]),
                "shortOptionFloor": _money(group["shortOptionFloor"]),
                "premiumPayable": _money(group["premiumPayable"]),
                "premiumReceivable": _money(group["premiumReceivable"]),
                "requirement": _money(group["requirement"]),
            }
        )
        gross_span_total += group["grossSpan"]
        net_span_total += net_span
        charges_total += (
            group["exposureMargin"] + group["additionalMargin"] + group["deliveryMargin"]
        )
        premium_payable_total += group["premiumPayable"]
        premium_receivable_total += group["premiumReceivable"]
        derivative_requirement_total += requirement

    cash_requirement_total = sum(item["requirement"] for item in cash_rows)
    cash_notional_total = sum(item["notional"] for item in cash_rows)
    hedge_benefit = max(0.0, gross_span_total - net_span_total)
    total_requirement = derivative_requirement_total + cash_requirement_total
    blocked_funds = total_requirement + premium_payable_total

    cash_breakdown = [
        {
            "contractId": item["contractId"],
            "exchange": item["exchange"],
            "displayName": item["displayName"],
            "symbol": item["symbol"],
            "side": item["side"],
            "productType": item["productType"],
            "quantity": item["quantity"],
            "price": item["price"],
            "notional": item["notional"],
            "varMargin": item["varMargin"],
            "elmMargin": item["elmMargin"],
            "adhocMargin": item["adhocMargin"],
            "requirement": item["requirement"],
        }
        for item in cash_rows
    ]

    return {
        "summary": {
            "grossSpan": _money(gross_span_total),
            "netSpan": _money(net_span_total),
            "hedgeBenefit": _money(hedge_benefit),
            "charges": _money(charges_total),
            "cashMargin": _money(cash_requirement_total),
            "cashNotional": _money(cash_notional_total),
            "premiumPayable": _money(premium_payable_total),
            "premiumReceivable": _money(premium_receivable_total),
            "derivativeRequirement": _money(derivative_requirement_total),
            "totalRequirement": _money(total_requirement),
            "blockedFunds": _money(blocked_funds),
            "positionCount": len(positions),
        },
        "derivativeBreakdown": derivative_breakdown,
        "cashBreakdown": cash_breakdown,
        "positions": positions,
    }
