import datetime
from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base


class Hospital(Base):
    __tablename__ = "hospitals"

    hospital_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    hospital_name: Mapped[str] = mapped_column(String(255))
    hospital_type: Mapped[str] = mapped_column(String(100))
    city: Mapped[str] = mapped_column(String(100))
    province: Mapped[str] = mapped_column(String(100))
    number_of_beds: Mapped[int] = mapped_column(Integer)
    average_bed_occupancy: Mapped[float] = mapped_column(Float)
    average_daily_outpatient_visits: Mapped[int] = mapped_column(Integer)
    average_daily_emergency_visits: Mapped[int] = mapped_column(Integer)
    average_daily_inpatient_admissions: Mapped[int] = mapped_column(Integer)
    average_daily_discharges: Mapped[int] = mapped_column(Integer)
    icu_beds: Mapped[int] = mapped_column(Integer)
    ccu_beds: Mapped[int] = mapped_column(Integer)
    picu_beds: Mapped[int] = mapped_column(Integer)
    nicu_beds: Mapped[int] = mapped_column(Integer)
    number_of_operation_theatres: Mapped[int] = mapped_column(Integer)
    average_daily_surgeries: Mapped[int] = mapped_column(Integer)
    average_daily_procedures: Mapped[int] = mapped_column(Integer)
    number_of_clinical_departments: Mapped[int] = mapped_column(Integer)
    approximate_number_of_medical_consumable_skus: Mapped[int] = mapped_column(Integer)

    departments: Mapped[list["Department"]] = relationship(back_populates="hospital")
    stores: Mapped[list["Store"]] = relationship(back_populates="hospital")
    medical_items: Mapped[list["MedicalItem"]] = relationship(back_populates="hospital")


class Category(Base):
    __tablename__ = "categories"

    category_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    category_name: Mapped[str] = mapped_column(String(255))
    category_description: Mapped[str | None] = mapped_column(Text)
    primary_cost_centre: Mapped[str | None] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer)
    active_flag: Mapped[bool] = mapped_column(Boolean)

    medical_items: Mapped[list["MedicalItem"]] = relationship(back_populates="category")


class Store(Base):
    __tablename__ = "stores"

    store_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    hospital_id: Mapped[str] = mapped_column(ForeignKey("hospitals.hospital_id"), index=True)
    store_name: Mapped[str] = mapped_column(String(255))
    store_type: Mapped[str] = mapped_column(String(50))
    location: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)

    hospital: Mapped["Hospital"] = relationship(back_populates="stores")
    items: Mapped[list["MedicalItem"]] = relationship(back_populates="store")


class Department(Base):
    __tablename__ = "departments"

    department_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    hospital_id: Mapped[str] = mapped_column(ForeignKey("hospitals.hospital_id"), index=True)
    department_name: Mapped[str] = mapped_column(String(255))
    department_type: Mapped[str] = mapped_column(String(100))
    primary_store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"), index=True)
    patient_population: Mapped[str] = mapped_column(String(20))
    demand_driver: Mapped[str] = mapped_column(String(50))
    demand_driver_description: Mapped[str | None] = mapped_column(String(255))
    indent_cycle_days: Mapped[int] = mapped_column(Integer)
    urgent_indent_probability: Mapped[float] = mapped_column(Float)

    hospital: Mapped["Hospital"] = relationship(back_populates="departments")
    primary_store: Mapped["Store"] = relationship()
    item_usages: Mapped[list["ItemDepartmentUsage"]] = relationship(back_populates="department")


class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"

    uom_code: Mapped[str] = mapped_column(String(20), primary_key=True)
    uom_name: Mapped[str] = mapped_column(String(50), unique=True)
    uom_description: Mapped[str | None] = mapped_column(Text)
    is_base_unit: Mapped[bool] = mapped_column(Boolean)
    typical_use: Mapped[str | None] = mapped_column(Text)


class MedicalItem(Base):
    __tablename__ = "medical_items"

    item_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    hospital_id: Mapped[str] = mapped_column(ForeignKey("hospitals.hospital_id"), index=True)
    family_key: Mapped[str] = mapped_column(String(20))
    item_name: Mapped[str] = mapped_column(String(255))
    item_description: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.category_id"), index=True)
    category_name: Mapped[str] = mapped_column(String(255))
    primary_cost_centre: Mapped[str | None] = mapped_column(String(100))
    sub_category: Mapped[str | None] = mapped_column(String(100))
    material: Mapped[str | None] = mapped_column(String(100))
    sterile_flag: Mapped[bool] = mapped_column(Boolean)
    # Unit NAME (e.g. "Box"); units_of_measure is keyed by code ("BOX"), so no FK on purpose.
    uom: Mapped[str] = mapped_column(String(50))
    uom_per_purchase_pack: Mapped[int] = mapped_column(Integer)
    purchase_pack_description: Mapped[str | None] = mapped_column(String(255))
    size: Mapped[str | None] = mapped_column(String(50))
    gauge: Mapped[str | None] = mapped_column(String(20))
    length: Mapped[str | None] = mapped_column(String(20))
    target_population: Mapped[str] = mapped_column(String(20))
    criticality: Mapped[str] = mapped_column(String(5))
    ved_class: Mapped[str] = mapped_column(String(5))
    shelf_life_days: Mapped[int] = mapped_column(Integer)
    unit_cost_pkr: Mapped[float] = mapped_column(Numeric(12, 2))
    nominal_lead_time_days: Mapped[int] = mapped_column(Integer)
    demand_archetype: Mapped[str] = mapped_column(String(50))
    imported_flag: Mapped[bool] = mapped_column(Boolean)
    storage_condition: Mapped[str | None] = mapped_column(String(50))
    storage_temperature: Mapped[str | None] = mapped_column(String(20))
    seasonality_profile: Mapped[str | None] = mapped_column(String(100))
    variant_demand_weight: Mapped[float] = mapped_column(Float)

    hospital: Mapped["Hospital"] = relationship(back_populates="medical_items")
    category: Mapped["Category"] = relationship(back_populates="medical_items")
    supplier_items: Mapped[list["SupplierItem"]] = relationship(back_populates="item")
    department_usages: Mapped[list["ItemDepartmentUsage"]] = relationship(back_populates="item")


class Supplier(Base):
    __tablename__ = "suppliers"

    supplier_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    supplier_code: Mapped[str] = mapped_column(String(50), unique=True)
    supplier_name: Mapped[str] = mapped_column(String(255))
    supplier_type: Mapped[str] = mapped_column(String(50))
    city: Mapped[str] = mapped_column(String(100))
    region: Mapped[str] = mapped_column(String(100))
    payment_terms: Mapped[str] = mapped_column(String(20))
    reliability_class: Mapped[str] = mapped_column(String(20))
    typical_lead_time_days: Mapped[int] = mapped_column(Integer)
    lead_time_variability: Mapped[str] = mapped_column(String(20))
    minimum_order_value: Mapped[float] = mapped_column(Numeric(12, 2))
    active_flag: Mapped[bool] = mapped_column(Boolean)

    supplier_items: Mapped[list["SupplierItem"]] = relationship(back_populates="supplier")


class SupplierItem(Base):
    __tablename__ = "supplier_items"
    __table_args__ = (UniqueConstraint("supplier_id", "item_id"),)

    supplier_item_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.supplier_id"))
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"), index=True)
    supplier_item_code: Mapped[str] = mapped_column(String(50))
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2))
    minimum_order_quantity: Mapped[int] = mapped_column(Integer)
    contract_start_date: Mapped[datetime.date] = mapped_column(Date)
    contract_end_date: Mapped[datetime.date] = mapped_column(Date)
    preferred_supplier_flag: Mapped[bool] = mapped_column(Boolean)
    lead_time_days: Mapped[int] = mapped_column(Integer)
    lead_time_variability: Mapped[str] = mapped_column(String(20))
    supply_status: Mapped[str] = mapped_column(String(20))

    supplier: Mapped["Supplier"] = relationship(back_populates="supplier_items")
    item: Mapped["MedicalItem"] = relationship(back_populates="supplier_items")


class ItemDepartmentUsage(Base):
    __tablename__ = "item_department_usage"
    __table_args__ = (UniqueConstraint("item_id", "department_id"),)

    item_department_usage_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.department_id"), index=True)
    usage_profile: Mapped[str] = mapped_column(String(50))
    typical_use_level: Mapped[str] = mapped_column(String(20))
    primary_use_flag: Mapped[bool] = mapped_column(Boolean)

    item: Mapped["MedicalItem"] = relationship(back_populates="department_usages")
    department: Mapped["Department"] = relationship(back_populates="item_usages")


class CalendarDay(Base):
    __tablename__ = "calendar"

    date: Mapped[datetime.date] = mapped_column(Date, primary_key=True)
    is_ramadan: Mapped[bool] = mapped_column(Boolean)
    is_eid: Mapped[bool] = mapped_column(Boolean)
    is_public_holiday: Mapped[bool] = mapped_column(Boolean)
    is_weekend: Mapped[bool] = mapped_column(Boolean)
